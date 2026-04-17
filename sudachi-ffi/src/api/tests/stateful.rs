use super::common::*;
use super::*;
use crate::error::{ERR_NULL_POINTER, OK, status_code_name};
use std::ffi::CString;
use std::ptr;

#[test]
fn create_stateful_tokenizer_from_tokenizer_requires_tokenizer_handle() {
    let mut out_handle: *mut StatefulTokenizerHandle = ptr::null_mut();
    let status = sudachi_create_stateful_tokenizer_from_tokenizer(ptr::null(), &mut out_handle);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_handle.is_null());
}

#[test]
fn stateful_tokenizer_set_mode_requires_non_null_handle() {
    let status = sudachi_stateful_tokenizer_set_mode(ptr::null_mut(), 0);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn stateful_tokenizer_reuses_handle_and_respects_mode_changes() {
    with_test_stateful_from_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();
        let mut out_c = ptr::null_mut();
        let status = sudachi_stateful_tokenizer_reset(handle, text.as_ptr());
        assert_eq!(status, OK, "{}", last_error_message());

        let status =
            sudachi_stateful_tokenizer_do_tokenize(handle, Projection::Surface as i32, &mut out_c);
        assert_eq!(status, OK, "{}", last_error_message());
        let c_values = collect_surfaces_and_offsets(out_c);
        sudachi_free_result(out_c);

        let status = sudachi_stateful_tokenizer_set_mode(handle, 0);
        assert_eq!(status, OK, "{}", last_error_message());
        let mut out_a = ptr::null_mut();
        let status =
            sudachi_stateful_tokenizer_do_tokenize(handle, Projection::Surface as i32, &mut out_a);
        assert_eq!(status, OK, "{}", last_error_message());
        let a_values = collect_surfaces_and_offsets(out_a);
        sudachi_free_result(out_a);

        assert!(!c_values.is_empty());
        assert!(!a_values.is_empty());
        assert!(a_values.len() >= c_values.len());
    });
}

#[test]
fn stateful_tokenizer_subset_controls_output_fields() {
    with_test_stateful_from_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_stateful_tokenizer_set_subset(handle, 1 << 0);
        assert_eq!(status, OK, "{}", last_error_message());
        let status = sudachi_stateful_tokenizer_reset(handle, text.as_ptr());
        assert_eq!(status, OK, "{}", last_error_message());
        let status = sudachi_stateful_tokenizer_do_tokenize(
            handle,
            Projection::Surface as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_morpheme_result(out_result);
        sudachi_free_result(out_result);

        assert!(!values.is_empty());
        assert!(values.iter().all(|item| item.normalized.is_null()));
    });
}

#[test]
fn stateful_tokenizer_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_stateful_from_tokenizer(|handle| {
        let text = CString::new("a😀b").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_stateful_tokenizer_reset(handle, text.as_ptr());
        assert_eq!(status, OK, "{}", last_error_message());
        let status =
            sudachi_stateful_tokenizer_do_tokenize(handle, Projection::Surface as i32, &mut out_result);
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets_with_chars(out_result);
        sudachi_free_result(out_result);

        assert!(!values.is_empty());
        for (_, begin_byte, end_byte, begin_char, end_char) in values {
            assert_eq!(begin_char, utf16_index_for_byte_offset(text_str, begin_byte));
            assert_eq!(end_char, utf16_index_for_byte_offset(text_str, end_byte));
        }
    });
}
