use super::common::*;
use super::*;
use crate::error::status_code_name;
use std::ffi::CString;
use std::ptr;

#[test]
fn compile_pos_matcher_returns_exact_pos_ids() {
    with_test_tokenizer(|handle| {
        let mut lookup_result = ptr::null_mut();
        let text = CString::new("東京都").unwrap();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut lookup_result,
        );
        assert_eq!(status, crate::error::OK, "{}", last_error_message());
        let lookup_values = collect_lookup_values(lookup_result);
        sudachi_free_lookup_result(lookup_result);

        let exact_pos = &lookup_values[0].1;
        let exact_pattern = format!(
            "[[{}]]",
            exact_pos
                .split(',')
                .map(|part| format!("{part:?}"))
                .collect::<Vec<_>>()
                .join(",")
        );

        let mut out_result = ptr::null_mut();
        let pattern = CString::new(exact_pattern).unwrap();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);
        assert_eq!(status, crate::error::OK, "{}", last_error_message());

        let ids = collect_pos_matcher_ids(out_result);
        sudachi_free_pos_matcher_result(out_result);

        assert!(ids.contains(&lookup_values[0].5));
        assert_eq!(ids.len(), 1);
    });
}

#[test]
fn compile_pos_matcher_supports_wildcards() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut lookup_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut lookup_result,
        );
        assert_eq!(status, crate::error::OK, "{}", last_error_message());
        sudachi_free_lookup_result(lookup_result);

        let pattern = CString::new(r#"[["名詞", null, null, null, null, null]]"#).unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);
        assert_eq!(status, crate::error::OK, "{}", last_error_message());

        let ids = collect_pos_matcher_ids(out_result);
        sudachi_free_pos_matcher_result(out_result);

        assert_eq!(ids, vec![3, 4, 7]);
    });
}

#[test]
fn compile_pos_matcher_rejects_invalid_pattern() {
    with_test_tokenizer(|handle| {
        let pattern = CString::new(r#"[["名詞", null, null, null, null, null, null]]"#).unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);

        assert_eq!(status, crate::error::ERR_INTERNAL);
        assert_eq!(status_code_name(status), "INTERNAL");
        assert!(out_result.is_null());
        assert_eq!(
            last_error_message(),
            "invalid POS matcher pattern: patterns must not exceed 6 fields"
        );
    });
}

#[test]
fn compile_pos_matcher_rejects_raw_control_char_in_json_string() {
    with_test_tokenizer(|handle| {
        let pattern = CString::new("[[\"名詞\n\", null, null, null, null, null]]").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);

        assert_eq!(status, crate::error::ERR_INTERNAL);
        assert_eq!(status_code_name(status), "INTERNAL");
        assert!(out_result.is_null());
        assert_eq!(
            last_error_message(),
            "invalid POS matcher pattern: unescaped control character in string"
        );
    });
}
