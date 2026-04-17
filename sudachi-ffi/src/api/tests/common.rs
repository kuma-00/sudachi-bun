use super::super::*;
use crate::error::OK;
use crate::result::{
    DictionaryBuildReportArray, LookupResultArray, MorphemeResult, MorphemeResultArray,
    PosMatcherResultArray, PretokenizedResultArray,
};
use std::env;
use std::ffi::{CStr, CString};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::{fs, ptr};

pub(super) static TOKENIZER_TEST_COUNTER: AtomicU64 = AtomicU64::new(0);
pub(super) const FFI_INFO_SUBSET_POS_TEXT_BIT: u32 = 1 << 30;

struct TestDictionaryConfig {
    config_path: PathBuf,
    config_path_c: CString,
    dict_path_c: CString,
}

pub(super) fn find_sudachi_checkout_dir() -> PathBuf {
    let cargo_home = env::var_os("CARGO_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".cargo")))
        .expect("CARGO_HOME or HOME must be set");
    let checkouts_dir = cargo_home.join("git").join("checkouts");

    let checkout_entries = fs::read_dir(&checkouts_dir)
        .unwrap_or_else(|err| panic!("failed to read {}: {err}", checkouts_dir.display()));

    for entry in checkout_entries {
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !name.starts_with("sudachi.rs-") {
            continue;
        }

        let Ok(revisions) = fs::read_dir(&path) else {
            continue;
        };
        for revision in revisions {
            let Ok(revision) = revision else {
                continue;
            };
            let checkout_dir = revision.path();
            let crate_dir = checkout_dir.join("sudachi");
            let resources = crate_dir.join("tests").join("resources");
            if resources.join("sudachi.json").is_file() && resources.join("system.dic.test").is_file() {
                return checkout_dir;
            }
        }
    }

    panic!(
        "failed to locate sudachi.rs test resources in {}",
        checkouts_dir.display()
    );
}

fn prepare_test_dictionary_config() -> TestDictionaryConfig {
    let checkout_dir = find_sudachi_checkout_dir();
    let test_resources = checkout_dir.join("sudachi").join("tests").join("resources");
    let resource_root = checkout_dir.join("resources");
    let dict_path = test_resources.join("system.dic.test");
    let config_path = env::temp_dir().join(format!(
        "sudachi-ffi-test-{}-{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        TOKENIZER_TEST_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let config_json = format!(
        concat!(
            "{{\n",
            "  \"path\": \"{}\",\n",
            "  \"characterDefinitionFile\": \"char.def\",\n",
            "  \"inputTextPlugin\": [\n",
            "    {{ \"class\": \"com.worksap.nlp.sudachi.DefaultInputTextPlugin\" }}\n",
            "  ],\n",
            "  \"oovProviderPlugin\": [\n",
            "    {{\n",
            "      \"class\": \"com.worksap.nlp.sudachi.SimpleOovPlugin\",\n",
            "      \"oovPOS\": [\"名詞\", \"普通名詞\", \"一般\", \"*\", \"*\", \"*\"],\n",
            "      \"leftId\": 8,\n",
            "      \"rightId\": 8,\n",
            "      \"cost\": 6000\n",
            "    }}\n",
            "  ],\n",
            "  \"pathRewritePlugin\": [\n",
            "    {{ \"class\": \"com.worksap.nlp.sudachi.JoinNumericPlugin\", \"enableNormalize\": true }},\n",
            "    {{\n",
            "      \"class\": \"com.worksap.nlp.sudachi.JoinKatakanaOovPlugin\",\n",
            "      \"oovPOS\": [\"名詞\", \"普通名詞\", \"一般\", \"*\", \"*\", \"*\"],\n",
            "      \"minLength\": 3\n",
            "    }}\n",
            "  ]\n",
            "}}\n"
        ),
        resource_root.to_str().expect("resource root must be UTF-8")
    );
    fs::write(&config_path, config_json).expect("failed to write test sudachi config");

    TestDictionaryConfig {
        config_path_c: CString::new(config_path.to_str().expect("config path must be UTF-8")).unwrap(),
        dict_path_c: CString::new(dict_path.to_str().expect("dict path must be UTF-8")).unwrap(),
        config_path,
    }
}

pub(super) fn read_test_dictionary_bytes(file_name: &str) -> Vec<u8> {
    let checkout_dir = find_sudachi_checkout_dir();
    let path = checkout_dir
        .join("sudachi")
        .join("tests")
        .join("resources")
        .join(file_name);
    fs::read(path).expect("failed to read dictionary fixture")
}

pub(super) fn test_resources_dir() -> PathBuf {
    find_sudachi_checkout_dir()
        .join("sudachi")
        .join("tests")
        .join("resources")
}

pub(super) fn temp_build_output_path(name: &str, ext: &str) -> PathBuf {
    env::temp_dir().join(format!(
        "sudachi-ffi-build-{name}-{}-{}.{}",
        std::process::id(),
        TOKENIZER_TEST_COUNTER.fetch_add(1, Ordering::Relaxed),
        ext
    ))
}

pub(super) fn c_lexicon_array(paths: &[PathBuf]) -> (Vec<CString>, Vec<*const std::os::raw::c_char>) {
    let c_paths = paths
        .iter()
        .map(|path| CString::new(path.to_str().expect("path must be UTF-8")).unwrap())
        .collect::<Vec<_>>();
    let ptrs = c_paths.iter().map(|path| path.as_ptr()).collect::<Vec<_>>();
    (c_paths, ptrs)
}

pub(super) fn with_test_tokenizer<T>(f: impl FnOnce(*mut TokenizerHandle) -> T) -> T {
    let test_config = prepare_test_dictionary_config();

    let mut handle = ptr::null_mut();
    let status = sudachi_create_tokenizer(
        test_config.config_path_c.as_ptr(),
        ptr::null(),
        test_config.dict_path_c.as_ptr(),
        &mut handle,
    );
    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!handle.is_null());

    let output = f(handle);
    sudachi_free_tokenizer(handle);
    let _ = fs::remove_file(test_config.config_path);
    output
}

pub(super) fn with_test_pretokenizer<T>(f: impl FnOnce(*mut PretokenizerHandle) -> T) -> T {
    let test_config = prepare_test_dictionary_config();

    let mut handle = ptr::null_mut();
    let status = sudachi_create_pretokenizer(
        test_config.config_path_c.as_ptr(),
        ptr::null(),
        test_config.dict_path_c.as_ptr(),
        &mut handle,
    );
    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!handle.is_null());

    let output = f(handle);
    sudachi_free_pretokenizer(handle);
    let _ = fs::remove_file(test_config.config_path);
    output
}

pub(super) fn with_test_sentence_splitter<T>(f: impl FnOnce(*mut SentenceSplitterHandle) -> T) -> T {
    let test_config = prepare_test_dictionary_config();

    let mut handle = ptr::null_mut();
    let status = sudachi_create_sentence_splitter(
        test_config.config_path_c.as_ptr(),
        ptr::null(),
        test_config.dict_path_c.as_ptr(),
        &mut handle,
    );
    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!handle.is_null());

    let output = f(handle);
    sudachi_free_sentence_splitter(handle);
    let _ = fs::remove_file(test_config.config_path);
    output
}

pub(super) fn collect_surfaces_and_offsets(result: *mut MorphemeResultArray) -> Vec<(String, usize, usize)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                (surface, item.begin, item.end)
            })
            .collect()
    }
}

pub(super) fn collect_surfaces_and_offsets_with_chars(
    result: *mut MorphemeResultArray,
) -> Vec<(String, usize, usize, usize, usize)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                (surface, item.begin, item.end, item.begin_char, item.end_char)
            })
            .collect()
    }
}

pub(super) fn collect_morpheme_texts(
    result: *mut MorphemeResultArray,
) -> Vec<(String, String, String, String)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                let normalized = CStr::from_ptr(item.normalized).to_str().unwrap().to_owned();
                let dictionary_form = CStr::from_ptr(item.dictionary_form).to_str().unwrap().to_owned();
                let reading = CStr::from_ptr(item.reading).to_str().unwrap().to_owned();
                (surface, normalized, dictionary_form, reading)
            })
            .collect()
    }
}

pub(super) fn collect_morpheme_result(result: *mut MorphemeResultArray) -> Vec<MorphemeResult> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| MorphemeResult {
                surface: item.surface,
                normalized: item.normalized,
                dictionary_form: item.dictionary_form,
                reading: item.reading,
                pos: item.pos,
                begin: item.begin,
                end: item.end,
                begin_char: item.begin_char,
                end_char: item.end_char,
                word_id: item.word_id,
                head_word_length: item.head_word_length,
                split_a: item.split_a,
                split_a_len: item.split_a_len,
                split_b: item.split_b,
                split_b_len: item.split_b_len,
                word_structure: item.word_structure,
                word_structure_len: item.word_structure_len,
                pos_id: item.pos_id,
                dictionary_id: item.dictionary_id,
                is_oov: item.is_oov,
                total_cost: item.total_cost,
                synonym_group_ids: item.synonym_group_ids,
                synonym_group_ids_len: item.synonym_group_ids_len,
            })
            .collect()
    }
}

pub(super) fn collect_morpheme_costs(result: *mut MorphemeResultArray) -> (i32, Vec<i32>) {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return (array.internal_cost, Vec::new());
        }

        let items = std::slice::from_raw_parts(array.items, array.len);
        (array.internal_cost, items.iter().map(|item| item.total_cost).collect())
    }
}

pub(super) fn collect_lookup_values(
    result: *mut LookupResultArray,
) -> Vec<(String, String, String, i32, u8, u16)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                let pos = CStr::from_ptr(item.pos).to_str().unwrap().to_owned();
                let word_id = CStr::from_ptr(item.word_id).to_str().unwrap().to_owned();
                (surface, pos, word_id, item.dictionary_id, item.is_oov, item.pos_id)
            })
            .collect()
    }
}

pub(super) fn collect_pretokenized_values(
    result: *mut PretokenizedResultArray,
) -> Vec<(String, usize, usize, usize, usize)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                (surface, item.begin_byte, item.end_byte, item.begin_char, item.end_char)
            })
            .collect()
    }
}

pub(super) fn utf16_index_for_byte_offset(text: &str, byte_offset: usize) -> usize {
    assert!(byte_offset <= text.len());
    assert!(text.is_char_boundary(byte_offset));

    let mut utf16_index = 0usize;
    for (index, ch) in text.char_indices() {
        if index >= byte_offset {
            break;
        }
        utf16_index += ch.len_utf16();
    }

    utf16_index
}

pub(super) fn collect_pos_matcher_ids(result: *mut PosMatcherResultArray) -> Vec<u16> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items.to_vec()
    }
}

pub(super) fn collect_dictionary_build_report(
    result: *mut DictionaryBuildReportArray,
) -> Vec<(String, usize, u64, u8)> {
    assert!(!result.is_null());
    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }

        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                (
                    CStr::from_ptr(item.part).to_str().unwrap().to_owned(),
                    item.size,
                    item.elapsed_millis,
                    item.is_write,
                )
            })
            .collect()
    }
}

pub(super) fn last_error_message() -> String {
    let ptr = sudachi_get_last_error();
    if ptr.is_null() {
        return String::new();
    }

    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned()
}

#[allow(dead_code)]
pub(super) fn with_test_pretokenizer_from_tokenizer<T>(f: impl FnOnce(*mut PretokenizerHandle) -> T) -> T {
    with_test_tokenizer(|tokenizer_handle| {
        let mut handle = ptr::null_mut();
        let status = sudachi_create_pretokenizer_from_tokenizer(tokenizer_handle, &mut handle);
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let output = f(handle);
        sudachi_free_pretokenizer(handle);
        output
    })
}

pub(super) fn with_test_stateful_from_tokenizer<T>(f: impl FnOnce(*mut StatefulTokenizerHandle) -> T) -> T {
    with_test_tokenizer(|tokenizer_handle| {
        let mut handle = ptr::null_mut();
        let status = sudachi_create_stateful_tokenizer_from_tokenizer(tokenizer_handle, &mut handle);
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let output = f(handle);
        sudachi_free_stateful_tokenizer(handle);
        output
    })
}

struct CapturingDebugSink {
    lines: Arc<Mutex<Vec<String>>>,
}

impl PretokenizerDebugSink for CapturingDebugSink {
    fn emit(&self, record: &PretokenizeDebugRecord) {
        self.lines.lock().unwrap().push(format_pretokenize_debug_record(record));
    }
}

pub(super) struct PanicDebugSink;

impl PretokenizerDebugSink for PanicDebugSink {
    fn emit(&self, _: &PretokenizeDebugRecord) {
        panic!("pretokenizer debug sink panicked");
    }
}

pub(super) fn with_capturing_pretokenizer<T>(
    f: impl FnOnce(*mut PretokenizerHandle, Arc<Mutex<Vec<String>>>) -> T,
) -> T {
    with_test_tokenizer(|tokenizer_handle| {
        let mut handle = ptr::null_mut();
        let status = sudachi_create_pretokenizer_from_tokenizer(tokenizer_handle, &mut handle);
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let captured = Arc::new(Mutex::new(Vec::new()));
        let sink: Arc<dyn PretokenizerDebugSink> = Arc::new(CapturingDebugSink {
            lines: Arc::clone(&captured),
        });
        unsafe {
            (*handle).debug_sink = sink;
        }

        let output = f(handle, captured);
        sudachi_free_pretokenizer(handle);
        output
    })
}
