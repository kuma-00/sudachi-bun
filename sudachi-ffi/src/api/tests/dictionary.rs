use super::common::{
    TOKENIZER_TEST_COUNTER, c_lexicon_array, collect_dictionary_build_report, last_error_message,
    read_test_dictionary_bytes, temp_build_output_path, test_resources_dir,
};
use super::super::*;
use crate::error::{ERR_CONFIG, ERR_NULL_POINTER, OK, status_code_name};
use sudachi::dic::header::Header;
use std::ffi::CString;
use std::fs;
use std::mem::MaybeUninit;
use std::ptr;
use std::sync::atomic::Ordering;

#[test]
fn build_system_dictionary_succeeds_and_returns_report() {
    let resources = test_resources_dir();
    let matrix_path = resources.join("matrix_10x10.def");
    let lexicon_paths = vec![resources.join("lex.csv")];
    let output_path = temp_build_output_path("system", "dic");
    let description = CString::new("ffi system build test").unwrap();
    let matrix_path_c = CString::new(matrix_path.to_str().expect("matrix path must be UTF-8")).unwrap();
    let output_path_c = CString::new(output_path.to_str().expect("output path must be UTF-8")).unwrap();
    let (_lexicon_c, lexicon_ptrs) = c_lexicon_array(&lexicon_paths);
    let mut out_report = ptr::null_mut();

    let status = sudachi_build_system_dictionary(
        matrix_path_c.as_ptr(),
        lexicon_ptrs.as_ptr(),
        lexicon_ptrs.len(),
        output_path_c.as_ptr(),
        description.as_ptr(),
        &mut out_report,
    );

    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!out_report.is_null());
    let report = collect_dictionary_build_report(out_report);
    assert!(!report.is_empty());
    assert!(report.iter().all(|(part, _, _, _)| !part.is_empty()));

    let bytes = fs::read(&output_path).expect("failed to read built system dictionary");
    let mut inspect = DictionaryInspectionResult::default();
    let status = sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), &mut inspect);
    assert_eq!(status, OK, "{}", last_error_message());
    assert_eq!(inspect.kind, 1);
    assert_eq!(inspect.is_loadable, 1);

    sudachi_free_dictionary_build_report(out_report);
    let _ = fs::remove_file(output_path);
}

#[test]
fn build_user_dictionary_succeeds_and_returns_report() {
    let resources = test_resources_dir();
    let system_dict_path = resources.join("system.dic.test");
    let lexicon_paths = vec![resources.join("user1.csv")];
    let output_path = temp_build_output_path("user", "dic");
    let description = CString::new("ffi user build test").unwrap();
    let system_dict_path_c =
        CString::new(system_dict_path.to_str().expect("system dict path must be UTF-8")).unwrap();
    let output_path_c = CString::new(output_path.to_str().expect("output path must be UTF-8")).unwrap();
    let (_lexicon_c, lexicon_ptrs) = c_lexicon_array(&lexicon_paths);
    let mut out_report = ptr::null_mut();

    let status = sudachi_build_user_dictionary(
        system_dict_path_c.as_ptr(),
        lexicon_ptrs.as_ptr(),
        lexicon_ptrs.len(),
        output_path_c.as_ptr(),
        description.as_ptr(),
        &mut out_report,
    );

    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!out_report.is_null());
    let report = collect_dictionary_build_report(out_report);
    assert!(!report.is_empty());
    assert!(report.iter().all(|(part, _, _, _)| !part.is_empty()));

    let bytes = fs::read(&output_path).expect("failed to read built user dictionary");
    let mut inspect = DictionaryInspectionResult::default();
    let status = sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), &mut inspect);
    assert_eq!(status, OK, "{}", last_error_message());
    assert_eq!(inspect.kind, 2);
    assert_eq!(inspect.is_loadable, 1);

    sudachi_free_dictionary_build_report(out_report);
    let _ = fs::remove_file(output_path);
}

#[test]
fn build_dictionary_rejects_output_path_aliasing_inputs() {
    let resources = test_resources_dir();

    // System build: output_path == matrix_path must be rejected before any writes.
    let matrix_path = resources.join("matrix_10x10.def");
    let lexicon_paths = vec![resources.join("lex.csv")];
    let matrix_before = fs::read(&matrix_path).expect("failed to read matrix fixture");
    let matrix_name = matrix_path
        .file_name()
        .expect("matrix file name must exist")
        .to_string_lossy()
        .to_string();
    let matrix_temp_prefix = format!(".{matrix_name}.sudachi-build-");
    let matrix_parent = matrix_path.parent().expect("matrix parent must exist");
    assert!(
        fs::read_dir(matrix_parent)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .all(|name| !name.starts_with(&matrix_temp_prefix)),
        "unexpected pre-existing build temp files next to matrix fixture"
    );

    let matrix_path_c = CString::new(matrix_path.to_str().expect("matrix path must be UTF-8")).unwrap();
    let output_path_c = CString::new(matrix_path.to_str().expect("output path must be UTF-8")).unwrap();
    let (_lexicon_c, lexicon_ptrs) = c_lexicon_array(&lexicon_paths);
    let mut out_report = ptr::null_mut();
    let status = sudachi_build_system_dictionary(
        matrix_path_c.as_ptr(),
        lexicon_ptrs.as_ptr(),
        lexicon_ptrs.len(),
        output_path_c.as_ptr(),
        ptr::null(),
        &mut out_report,
    );
    assert_eq!(status, ERR_CONFIG);
    assert!(out_report.is_null());
    assert!(
        last_error_message().contains("must not alias input file"),
        "unexpected error message: {}",
        last_error_message()
    );
    let matrix_after = fs::read(&matrix_path).expect("failed to read matrix fixture after call");
    assert_eq!(matrix_before, matrix_after, "matrix fixture was modified");
    assert!(
        fs::read_dir(matrix_parent)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .all(|name| !name.starts_with(&matrix_temp_prefix)),
        "build temp files were created next to the matrix fixture"
    );

    // User build: output_path == system_dict_path must be rejected before any writes.
    let system_dict_path = resources.join("system.dic.test");
    let user_lexicon_paths = vec![resources.join("user1.csv")];
    let system_before = fs::read(&system_dict_path).expect("failed to read system dic fixture");
    let system_name = system_dict_path
        .file_name()
        .expect("system dic file name must exist")
        .to_string_lossy()
        .to_string();
    let system_temp_prefix = format!(".{system_name}.sudachi-build-");
    let system_parent = system_dict_path.parent().expect("system dic parent must exist");
    assert!(
        fs::read_dir(system_parent)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .all(|name| !name.starts_with(&system_temp_prefix)),
        "unexpected pre-existing build temp files next to system dic fixture"
    );

    let system_dict_path_c = CString::new(
        system_dict_path
            .to_str()
            .expect("system dict path must be UTF-8"),
    )
    .unwrap();
    let user_output_path_c = CString::new(
        system_dict_path
            .to_str()
            .expect("user output path must be UTF-8"),
    )
    .unwrap();
    let (_user_lexicon_c, user_lexicon_ptrs) = c_lexicon_array(&user_lexicon_paths);
    let mut out_report = ptr::null_mut();
    let status = sudachi_build_user_dictionary(
        system_dict_path_c.as_ptr(),
        user_lexicon_ptrs.as_ptr(),
        user_lexicon_ptrs.len(),
        user_output_path_c.as_ptr(),
        ptr::null(),
        &mut out_report,
    );
    assert_eq!(status, ERR_CONFIG);
    assert!(out_report.is_null());
    assert!(
        last_error_message().contains("must not alias input file"),
        "unexpected error message: {}",
        last_error_message()
    );
    let system_after =
        fs::read(&system_dict_path).expect("failed to read system dic fixture after call");
    assert_eq!(system_before, system_after, "system dic fixture was modified");
    assert!(
        fs::read_dir(system_parent)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .all(|name| !name.starts_with(&system_temp_prefix)),
        "build temp files were created next to the system dic fixture"
    );
}

#[test]
fn finalize_dictionary_output_replaces_existing_output_file() {
    let output_path = temp_build_output_path("finalize-replace-existing", "dic");
    let output_name = output_path
        .file_name()
        .expect("output file name must exist")
        .to_string_lossy()
        .to_string();
    let temp_path = output_path.with_file_name(format!(
        ".{output_name}.sudachi-finalize-test-{}",
        TOKENIZER_TEST_COUNTER.fetch_add(1, Ordering::Relaxed)
    ));

    fs::write(&output_path, b"old").expect("failed to write pre-existing output file");
    fs::write(&temp_path, b"new").expect("failed to write temp output file");

    let result = super::super::ops::finalize_dictionary_output(&temp_path, &output_path, "test");
    assert_eq!(result, Ok(()), "{}", last_error_message());
    assert_eq!(
        fs::read(&output_path).expect("failed to read finalized output"),
        b"new"
    );
    assert!(!temp_path.exists(), "temp file should have been moved");

    let _ = fs::remove_file(output_path);
}

#[test]
fn build_dictionary_cleans_up_temp_file_on_finalize_error() {
    let resources = test_resources_dir();
    let matrix_path = resources.join("matrix_10x10.def");
    let lexicon_paths = vec![resources.join("lex.csv")];
    let output_path = temp_build_output_path("finalize-error-dir-output", "dic");
    fs::create_dir(&output_path).expect("failed to create output directory");

    let output_name = output_path
        .file_name()
        .expect("output file name must exist")
        .to_string_lossy()
        .to_string();
    let temp_prefix = format!(".{output_name}.sudachi-build-");
    let output_parent = output_path.parent().expect("output parent must exist");

    let matrix_path_c = CString::new(matrix_path.to_str().expect("matrix path must be UTF-8")).unwrap();
    let output_path_c = CString::new(output_path.to_str().expect("output path must be UTF-8")).unwrap();
    let (_lexicon_c, lexicon_ptrs) = c_lexicon_array(&lexicon_paths);
    let mut out_report = ptr::null_mut();
    let status = sudachi_build_system_dictionary(
        matrix_path_c.as_ptr(),
        lexicon_ptrs.as_ptr(),
        lexicon_ptrs.len(),
        output_path_c.as_ptr(),
        ptr::null(),
        &mut out_report,
    );

    assert_eq!(status, ERR_CONFIG);
    assert!(out_report.is_null());
    assert!(
        fs::read_dir(output_parent)
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .all(|name| !name.starts_with(&temp_prefix)),
        "build temp files were not cleaned up after finalize error"
    );

    let _ = fs::remove_dir(output_path);
}

#[test]
fn build_dictionary_fails_on_invalid_arguments() {
    let resources = test_resources_dir();
    let matrix_path = resources.join("matrix_10x10.def");
    let output_path = temp_build_output_path("invalid", "dic");
    let matrix_path_c = CString::new(matrix_path.to_str().expect("matrix path must be UTF-8")).unwrap();
    let output_path_c = CString::new(output_path.to_str().expect("output path must be UTF-8")).unwrap();
    let mut out_report = ptr::null_mut();

    let status = sudachi_build_system_dictionary(
        matrix_path_c.as_ptr(),
        ptr::null(),
        1,
        output_path_c.as_ptr(),
        ptr::null(),
        &mut out_report,
    );
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_report.is_null());

    let status = sudachi_build_system_dictionary(
        matrix_path_c.as_ptr(),
        ptr::null(),
        0,
        output_path_c.as_ptr(),
        ptr::null(),
        &mut out_report,
    );
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_report.is_null());
}

#[test]
fn inspect_dictionary_bytes_detects_system_dictionary() {
    let bytes = read_test_dictionary_bytes("system.dic.test");
    let mut inspection = MaybeUninit::<DictionaryInspectionResult>::uninit();

    let status =
        sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), inspection.as_mut_ptr());

    assert_eq!(status, OK, "{}", last_error_message());
    let inspection = unsafe { inspection.assume_init() };
    assert_eq!(inspection.kind, 1);
    assert_eq!(inspection.header_version, 2);
    assert_eq!(inspection.is_loadable, 1);
}

#[test]
fn inspect_dictionary_bytes_detects_user_dictionary() {
    let bytes = read_test_dictionary_bytes("user.dic.test");
    let mut inspection = MaybeUninit::<DictionaryInspectionResult>::uninit();

    let status =
        sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), inspection.as_mut_ptr());

    assert_eq!(status, OK, "{}", last_error_message());
    let inspection = unsafe { inspection.assume_init() };
    assert_eq!(inspection.kind, 2);
    assert_eq!(inspection.header_version, 3);
    assert_eq!(inspection.is_loadable, 1);
}

#[test]
fn inspect_dictionary_bytes_rejects_invalid_bytes() {
    let bytes = [1_u8, 2, 3, 4];
    let mut inspection = MaybeUninit::<DictionaryInspectionResult>::uninit();

    let status =
        sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), inspection.as_mut_ptr());

    assert_eq!(status, ERR_CONFIG);
    assert_eq!(status_code_name(status), "CONFIG");
    let inspection = unsafe { inspection.assume_init() };
    assert_eq!(inspection.kind, 0);
    assert_eq!(inspection.header_version, -1);
    assert_eq!(inspection.is_loadable, 0);
}

#[test]
fn inspect_dictionary_bytes_rejects_invalid_header_bytes() {
    let bytes = vec![0_u8; Header::STORAGE_SIZE];
    let mut inspection = MaybeUninit::<DictionaryInspectionResult>::uninit();

    let status =
        sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), inspection.as_mut_ptr());

    assert_eq!(status, ERR_CONFIG);
    assert_eq!(status_code_name(status), "CONFIG");
    let inspection = unsafe { inspection.assume_init() };
    assert_eq!(inspection.kind, 0);
    assert_eq!(inspection.header_version, -1);
    assert_eq!(inspection.is_loadable, 0);
}

#[test]
fn inspect_dictionary_bytes_preserves_header_on_load_failure() {
    let mut bytes = read_test_dictionary_bytes("system.dic.test");
    bytes.truncate(Header::STORAGE_SIZE);
    let mut inspection = MaybeUninit::<DictionaryInspectionResult>::uninit();

    let status =
        sudachi_inspect_dictionary_bytes(bytes.as_ptr(), bytes.len(), inspection.as_mut_ptr());

    assert_eq!(status, ERR_CONFIG);
    assert_eq!(status_code_name(status), "CONFIG");
    let inspection = unsafe { inspection.assume_init() };
    assert_eq!(inspection.kind, 1);
    assert_eq!(inspection.header_version, 2);
    assert_eq!(inspection.is_loadable, 0);
}
