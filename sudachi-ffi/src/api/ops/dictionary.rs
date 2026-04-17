use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::mem::{offset_of, size_of};
use std::os::raw::c_char;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use sudachi::config::Config;
use sudachi::dic::build::DictBuilder;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::header::{Header, HeaderVersion, SystemDictVersion, UserDictVersion};
use sudachi::dic::DictionaryLoader;

use super::run_ffi;
use crate::convert::{cstr_to_path, cstr_to_string};
use crate::error::{ERR_CONFIG, error};
use crate::result::{
    DictionaryBuildReportArray, dictionary_build_reports_to_array, require_non_null,
};

#[repr(C)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DictionaryInspectionResult {
    pub kind: i32,
    pub header_version: i32,
    pub is_loadable: i32,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DictionaryInspectionResultLayout {
    pub layout_version: u64,
    pub result_size: u64,
    pub kind_offset: u64,
    pub header_version_offset: u64,
    pub is_loadable_offset: u64,
    pub kind_unknown_value: u64,
    pub kind_system_value: u64,
    pub kind_user_value: u64,
}

impl Default for DictionaryInspectionResult {
    fn default() -> Self {
        Self {
            kind: DICTIONARY_KIND_UNKNOWN,
            header_version: -1,
            is_loadable: 0,
        }
    }
}

const DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION: u64 = 1;
const DICTIONARY_KIND_UNKNOWN: i32 = 0;
const DICTIONARY_KIND_SYSTEM: i32 = 1;
const DICTIONARY_KIND_USER: i32 = 2;
pub(crate) static BUILD_OUTPUT_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) fn load_dictionary(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
) -> Result<Arc<JapaneseDictionary>, i32> {
    let dict_path = cstr_to_path(dict_path)?;
    let config_path = if config_path.is_null() {
        None
    } else {
        Some(cstr_to_path(config_path)?)
    };
    let resource_dir = if resource_dir.is_null() {
        None
    } else {
        Some(cstr_to_path(resource_dir)?)
    };

    let cfg = Config::new(config_path, resource_dir, Some(dict_path))
        .map_err(|err| error(ERR_CONFIG, format!("failed to build sudachi config: {err}")))?;

    let dictionary = JapaneseDictionary::from_cfg(&cfg).map_err(|err| {
        error(
            ERR_CONFIG,
            format!("failed to load sudachi dictionary: {err}"),
        )
    })?;

    Ok(Arc::new(dictionary))
}

fn header_kind_and_version(version: &HeaderVersion) -> (i32, i32) {
    match version {
        HeaderVersion::SystemDict(system) => (
            DICTIONARY_KIND_SYSTEM,
            match system {
                SystemDictVersion::Version1 => 1,
                SystemDictVersion::Version2 => 2,
            },
        ),
        HeaderVersion::UserDict(user) => (
            DICTIONARY_KIND_USER,
            match user {
                UserDictVersion::Version1 => 1,
                UserDictVersion::Version2 => 2,
                UserDictVersion::Version3 => 3,
            },
        ),
    }
}

impl DictionaryInspectionResultLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION,
            result_size: size_of::<DictionaryInspectionResult>() as u64,
            kind_offset: offset_of!(DictionaryInspectionResult, kind) as u64,
            header_version_offset: offset_of!(DictionaryInspectionResult, header_version) as u64,
            is_loadable_offset: offset_of!(DictionaryInspectionResult, is_loadable) as u64,
            kind_unknown_value: DICTIONARY_KIND_UNKNOWN as u64,
            kind_system_value: DICTIONARY_KIND_SYSTEM as u64,
            kind_user_value: DICTIONARY_KIND_USER as u64,
        }
    }
}

impl Default for DictionaryInspectionResultLayout {
    fn default() -> Self {
        Self::new()
    }
}

pub(crate) fn dictionary_inspection_result_layout() -> DictionaryInspectionResultLayout {
    DictionaryInspectionResultLayout::new()
}

fn cstr_array_to_paths(
    ptr: *const *const c_char,
    len: usize,
    field_name: &str,
) -> Result<Vec<PathBuf>, i32> {
    require_non_null(ptr, "path array pointer was null")?;
    if len == 0 {
        return Err(error(
            ERR_CONFIG,
            format!("{field_name} must contain at least one path"),
        ));
    }

    let mut paths = Vec::with_capacity(len);
    let items = unsafe { std::slice::from_raw_parts(ptr, len) };
    for &item in items {
        paths.push(cstr_to_path(item)?);
    }
    Ok(paths)
}

fn write_build_report(
    out_report: *mut *mut DictionaryBuildReportArray,
    report_items: &[sudachi::dic::build::report::DictPartReport],
) -> Result<(), i32> {
    let report = dictionary_build_reports_to_array(report_items).map_err(|code| {
        error(
            code,
            "failed to convert dictionary build report to ffi result",
        )
    })?;
    crate::result::write_box_ptr(out_report, report, "out_report pointer was null")
}

fn build_temp_output_path(output_path: &std::path::Path) -> Result<PathBuf, i32> {
    let file_name = output_path.file_name().ok_or_else(|| {
        error(
            ERR_CONFIG,
            format!(
                "failed to derive a temporary path for dictionary output {}",
                output_path.display()
            ),
        )
    })?;

    let mut temp_name = std::ffi::OsString::from(".");
    temp_name.push(file_name);
    temp_name.push(format!(
        ".sudachi-build-{}-{}",
        std::process::id(),
        BUILD_OUTPUT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed),
    ));

    Ok(match output_path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.join(temp_name),
        _ => PathBuf::from(temp_name),
    })
}

fn resolve_path_for_alias_check(path: &std::path::Path) -> Option<PathBuf> {
    if let Ok(canon) = fs::canonicalize(path) {
        return Some(canon);
    }

    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => std::path::Path::new("."),
    };
    let file_name = path.file_name()?;
    let canon_parent = fs::canonicalize(parent).ok()?;
    Some(canon_parent.join(file_name))
}

fn validate_output_path_does_not_alias_inputs<'a, I>(
    output_path: &std::path::Path,
    output_kind: &str,
    inputs: I,
) -> Result<(), i32>
where
    I: IntoIterator<Item = (String, &'a std::path::Path)>,
{
    let output_canon = resolve_path_for_alias_check(output_path);
    for (label, input_path) in inputs {
        let input_canon = resolve_path_for_alias_check(input_path);
        let is_alias = match (&output_canon, &input_canon) {
            (Some(out), Some(input)) => out == input,
            _ => output_path == input_path,
        };
        if is_alias {
            return Err(error(
                ERR_CONFIG,
                format!(
                    "{output_kind} dictionary output path {} must not alias input file {label} ({})",
                    output_path.display(),
                    input_path.display()
                ),
            ));
        }
    }
    Ok(())
}

pub(crate) fn finalize_dictionary_output(
    temp_path: &std::path::Path,
    output_path: &std::path::Path,
    output_kind: &str,
) -> Result<(), i32> {
    match fs::metadata(output_path) {
        Ok(meta) => {
            if meta.is_dir() {
                return Err(error(
                    ERR_CONFIG,
                    format!(
                        "failed to finalize {output_kind} dictionary output file {}: output path is a directory",
                        output_path.display()
                    ),
                ));
            }
            fs::remove_file(output_path).map_err(|err| {
                error(
                    ERR_CONFIG,
                    format!(
                        "failed to finalize {output_kind} dictionary output file {}: failed to remove existing output file: {err}",
                        output_path.display()
                    ),
                )
            })?;
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => {
            return Err(error(
                ERR_CONFIG,
                format!(
                    "failed to finalize {output_kind} dictionary output file {}: failed to read existing output metadata: {err}",
                    output_path.display()
                ),
            ));
        }
    }

    fs::rename(temp_path, output_path).map_err(|err| {
        error(
            ERR_CONFIG,
            format!(
                "failed to finalize {output_kind} dictionary output file {}: {err}",
                output_path.display()
            ),
        )
    })?;

    Ok(())
}

struct TempOutputGuard {
    path: PathBuf,
    committed: bool,
}

impl TempOutputGuard {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            committed: false,
        }
    }
}

impl Drop for TempOutputGuard {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

pub(crate) fn write_dictionary_output(
    output_path: &std::path::Path,
    output_kind: &str,
    compile: impl FnOnce(&mut BufWriter<File>) -> Result<(), String>,
) -> Result<(), i32> {
    let temp_path = build_temp_output_path(output_path)?;
    write_dictionary_output_with_temp_path(output_path, temp_path, output_kind, compile)
}

pub(crate) fn write_dictionary_output_with_temp_path(
    output_path: &std::path::Path,
    temp_path: PathBuf,
    output_kind: &str,
    compile: impl FnOnce(&mut BufWriter<File>) -> Result<(), String>,
) -> Result<(), i32> {
    let file = File::create_new(&temp_path).map_err(|err| {
        error(
            ERR_CONFIG,
            format!(
                "failed to create {output_kind} dictionary output file {}: {err}",
                output_path.display()
            ),
        )
    })?;
    let mut guard = TempOutputGuard::new(temp_path.clone());

    let mut writer = BufWriter::new(file);
    compile(&mut writer).map_err(|err| {
        error(
            ERR_CONFIG,
            format!(
                "failed to compile {output_kind} dictionary to {}: {err}",
                output_path.display()
            ),
        )
    })?;
    writer.flush().map_err(|err| {
        error(
            ERR_CONFIG,
            format!(
                "failed to compile {output_kind} dictionary to {}: {err}",
                output_path.display()
            ),
        )
    })?;
    drop(writer);

    finalize_dictionary_output(&temp_path, output_path, output_kind)?;

    guard.committed = true;
    Ok(())
}

pub(crate) fn build_system_dictionary_impl(
    matrix_path: *const c_char,
    lexicon_paths: *const *const c_char,
    lexicon_paths_len: usize,
    output_path: *const c_char,
    description: *const c_char,
    out_report: *mut *mut DictionaryBuildReportArray,
) -> i32 {
    run_ffi(|| {
        require_non_null(out_report, "out_report pointer was null")?;
        let matrix_path = cstr_to_path(matrix_path)?;
        let lexicon_paths = cstr_array_to_paths(lexicon_paths, lexicon_paths_len, "lexicon_paths")?;
        let output_path = cstr_to_path(output_path)?;

        validate_output_path_does_not_alias_inputs(
            output_path.as_path(),
            "system",
            std::iter::once(("matrix_path".to_string(), matrix_path.as_path()))
                .chain(
                    lexicon_paths
                        .iter()
                        .enumerate()
                        .map(|(i, path)| (format!("lexicon_paths[{i}]"), path.as_path())),
                ),
        )?;

        let mut builder = DictBuilder::new_system();
        if !description.is_null() {
            builder.set_description(cstr_to_string(description)?);
        }
        builder.read_conn(matrix_path.as_path()).map_err(|err| {
            error(
                ERR_CONFIG,
                format!(
                    "failed to read system dictionary matrix {}: {err}",
                    matrix_path.display()
                ),
            )
        })?;
        for lexicon_path in &lexicon_paths {
            builder.read_lexicon(lexicon_path.as_path()).map_err(|err| {
                error(
                    ERR_CONFIG,
                    format!(
                        "failed to read system dictionary lexicon {}: {err}",
                        lexicon_path.display()
                    ),
                )
            })?;
        }
        builder.resolve().map_err(|err| {
            error(
                ERR_CONFIG,
                format!("failed to resolve system dictionary entries: {err}"),
            )
        })?;

        write_dictionary_output(output_path.as_path(), "system", |writer| {
            builder.compile(writer).map_err(|err| err.to_string())
        })?;
        write_build_report(out_report, builder.report())
    })
}

pub(crate) fn build_user_dictionary_impl(
    system_dict_path: *const c_char,
    lexicon_paths: *const *const c_char,
    lexicon_paths_len: usize,
    output_path: *const c_char,
    description: *const c_char,
    out_report: *mut *mut DictionaryBuildReportArray,
) -> i32 {
    run_ffi(|| {
        require_non_null(out_report, "out_report pointer was null")?;
        let system_dict_path = cstr_to_path(system_dict_path)?;
        let lexicon_paths = cstr_array_to_paths(lexicon_paths, lexicon_paths_len, "lexicon_paths")?;
        let output_path = cstr_to_path(output_path)?;

        validate_output_path_does_not_alias_inputs(
            output_path.as_path(),
            "user",
            std::iter::once(("system_dict_path".to_string(), system_dict_path.as_path()))
                .chain(
                    lexicon_paths
                        .iter()
                        .enumerate()
                        .map(|(i, path)| (format!("lexicon_paths[{i}]"), path.as_path())),
                ),
        )?;

        let system_bytes = std::fs::read(&system_dict_path).map_err(|err| {
            error(
                ERR_CONFIG,
                format!(
                    "failed to read system dictionary {}: {err}",
                    system_dict_path.display()
                ),
            )
        })?;
        let system_loader = DictionaryLoader::read_system_dictionary(&system_bytes).map_err(|err| {
            error(
                ERR_CONFIG,
                format!(
                    "failed to parse system dictionary {}: {err}",
                    system_dict_path.display()
                ),
            )
        })?;
        let loaded = system_loader.to_loaded().ok_or_else(|| {
            error(
                ERR_CONFIG,
                "system dictionary did not contain grammar for user dictionary build",
            )
        })?;

        let mut builder = DictBuilder::new_user(&loaded);
        if !description.is_null() {
            builder.set_description(cstr_to_string(description)?);
        }
        for lexicon_path in &lexicon_paths {
            builder.read_lexicon(lexicon_path.as_path()).map_err(|err| {
                error(
                    ERR_CONFIG,
                    format!(
                        "failed to read user dictionary lexicon {}: {err}",
                        lexicon_path.display()
                    ),
                )
            })?;
        }
        builder.resolve().map_err(|err| {
            error(
                ERR_CONFIG,
                format!("failed to resolve user dictionary entries: {err}"),
            )
        })?;

        write_dictionary_output(output_path.as_path(), "user", |writer| {
            builder.compile(writer).map_err(|err| err.to_string())
        })?;
        write_build_report(out_report, builder.report())
    })
}

pub(crate) fn inspect_dictionary_bytes_impl(
    bytes_ptr: *const u8,
    bytes_len: usize,
    out_result: *mut DictionaryInspectionResult,
) -> i32 {
    run_ffi(|| {
        require_non_null(out_result, "out_result pointer was null")?;
        require_non_null(bytes_ptr, "bytes_ptr pointer was null")?;

        let bytes = unsafe { std::slice::from_raw_parts(bytes_ptr, bytes_len) };
        let mut result = DictionaryInspectionResult::default();
        unsafe {
            *out_result = result;
        }

        if bytes_len < Header::STORAGE_SIZE {
            return Err(error(
                ERR_CONFIG,
                format!(
                    "dictionary bytes are too short: expected at least {} bytes, got {}",
                    Header::STORAGE_SIZE,
                    bytes_len
                ),
            ));
        }

        let header = Header::parse(&bytes[..Header::STORAGE_SIZE]).map_err(|err| {
            error(
                ERR_CONFIG,
                format!("failed to parse dictionary header from bytes: {err}"),
            )
        })?;
        let (kind, header_version) = header_kind_and_version(&header.version);
        result.kind = kind;
        result.header_version = header_version;

        let load_result = match kind {
            DICTIONARY_KIND_SYSTEM => DictionaryLoader::read_system_dictionary(bytes).map(|_| ()),
            DICTIONARY_KIND_USER => DictionaryLoader::read_user_dictionary(bytes).map(|_| ()),
            _ => DictionaryLoader::read_system_dictionary(bytes).map(|_| ()),
        };

        match load_result {
            Ok(()) => {
                result.is_loadable = 1;
                unsafe {
                    *out_result = result;
                }
                Ok(())
            }
            Err(err) => {
                unsafe {
                    *out_result = result;
                }
                Err(error(
                    ERR_CONFIG,
                    format!("dictionary bytes are not loadable: {err}"),
                ))
            }
        }
    })
}
