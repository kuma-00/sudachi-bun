use super::common::{last_error_message, with_test_sentence_splitter};
use super::super::*;
use crate::error::{ERR_NULL_POINTER, ERR_SENTENCE_SPLIT, OK, status_code_name};
use std::ffi::CString;
use std::ptr;

#[test]
fn create_sentence_splitter_from_tokenizer_requires_tokenizer_handle() {
    let mut out_handle: *mut SentenceSplitterHandle = ptr::null_mut();
    let status = sudachi_create_sentence_splitter_from_tokenizer(ptr::null(), &mut out_handle);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_handle.is_null());
}

#[test]
fn get_eos_requires_non_null_pointers() {
    let text = CString::new("東京都").unwrap();
    let mut out_eos = 0usize;
    let mut out_found = 0i32;

    let status = sudachi_get_eos(ptr::null(), text.as_ptr(), &mut out_eos, &mut out_found);
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");

    with_test_sentence_splitter(|handle| {
        let status = sudachi_get_eos(handle, ptr::null(), &mut out_eos, &mut out_found);
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");

        let status = sudachi_get_eos(handle, text.as_ptr(), ptr::null_mut(), &mut out_found);
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");

        let status = sudachi_get_eos(handle, text.as_ptr(), &mut out_eos, ptr::null_mut());
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
    });
}

#[test]
fn get_eos_returns_detected_boundary_with_found_flag() {
    with_test_sentence_splitter(|handle| {
        let text = CString::new("あいう。えお。").unwrap();
        let mut out_eos = usize::MAX;
        let mut out_found = -1i32;

        let status = sudachi_get_eos(handle, text.as_ptr(), &mut out_eos, &mut out_found);

        assert_eq!(status, OK, "{}", last_error_message());
        assert_eq!(out_found, 1);
        assert_eq!(out_eos, 12);
    });
}

#[test]
fn get_eos_reports_provisional_boundary_with_found_zero() {
    with_test_sentence_splitter(|handle| {
        let text = CString::new("あいうえお").unwrap();
        let mut out_eos = usize::MAX;
        let mut out_found = -1i32;

        let status = sudachi_get_eos(handle, text.as_ptr(), &mut out_eos, &mut out_found);

        assert_eq!(status, OK, "{}", last_error_message());
        assert_eq!(out_found, 0);
        assert_eq!(out_eos, 15);
    });
}

#[test]
fn get_eos_with_limit_supports_detection_and_provisional_boundary() {
    with_test_sentence_splitter(|handle| {
        let detected = CString::new("あい。うえお。").unwrap();
        let mut out_eos = usize::MAX;
        let mut out_found = -1i32;
        let status =
            sudachi_get_eos_with_limit(handle, detected.as_ptr(), 5, &mut out_eos, &mut out_found);
        assert_eq!(status, OK, "{}", last_error_message());
        assert_eq!(out_found, 1);
        assert_eq!(out_eos, 9);

        let provisional = CString::new("あ い うえお").unwrap();
        let status = sudachi_get_eos_with_limit(
            handle,
            provisional.as_ptr(),
            5,
            &mut out_eos,
            &mut out_found,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        assert_eq!(out_found, 0);
        assert_eq!(out_eos, 8);
    });
}

#[test]
fn get_eos_with_limit_rejects_non_positive_limit() {
    with_test_sentence_splitter(|handle| {
        let text = CString::new("あいう。").unwrap();
        let mut out_eos = usize::MAX;
        let mut out_found = -1i32;

        let status = sudachi_get_eos_with_limit(handle, text.as_ptr(), 0, &mut out_eos, &mut out_found);

        assert_eq!(status, ERR_SENTENCE_SPLIT);
        assert_eq!(status_code_name(status), "SENTENCE_SPLIT");
        assert_eq!(
            last_error_message(),
            "sentence detector limit must be greater than zero"
        );
        assert_eq!(out_eos, usize::MAX);
        assert_eq!(out_found, -1);
    });
}
