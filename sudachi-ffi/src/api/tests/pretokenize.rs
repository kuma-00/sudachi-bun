use super::common::*;
use super::*;
use crate::error::{ERR_NULL_POINTER, ERR_PRETOKENIZE, OK, status_code_name};
use std::ffi::{CStr, CString};
use std::ptr;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use sudachi::analysis::Mode;
use sudachi::dic::subset::InfoSubset;

#[test]
fn set_pretokenizer_debug_requires_non_null_handle() {
    let status = sudachi_set_pretokenizer_debug(ptr::null(), 1);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn create_pretokenizer_from_tokenizer_requires_tokenizer_handle() {
    let mut out_handle: *mut PretokenizerHandle = ptr::null_mut();
    let status = sudachi_create_pretokenizer_from_tokenizer(ptr::null(), &mut out_handle);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_handle.is_null());
}

#[test]
fn pretokenize_debug_record_format_is_stable() {
    let record = PretokenizeDebugRecord {
        mode: Mode::B,
        split_mode: Mode::C,
        projection: Projection::Reading,
        subset_bits: 0x1234_5678,
        include_pos_text: true,
        input_bytes: 18,
        token_count: 2,
        elapsed_us: 42,
    };

    assert_eq!(
        format_pretokenize_debug_record(&record),
        "{\"event\":\"pretokenize\",\"mode\":\"B\",\"split_mode\":\"C\",\"projection\":\"reading\",\"subset_bits\":305419896,\"include_pos_text\":true,\"input_bytes\":18,\"token_count\":2,\"elapsed_us\":42}"
    );
}

#[test]
fn pretokenize_debug_record_uses_dictionary_form_projection_name() {
    let record = PretokenizeDebugRecord {
        mode: Mode::A,
        split_mode: Mode::A,
        projection: Projection::DictionaryForm,
        subset_bits: 0,
        include_pos_text: false,
        input_bytes: 3,
        token_count: 1,
        elapsed_us: 1,
    };

    assert!(
        format_pretokenize_debug_record(&record).contains("\"projection\":\"dictionary_form\"")
    );
}

#[test]
fn pretokenizer_debug_record_uses_new_projection_names() {
    with_capturing_pretokenizer(|handle, captured| {
        let text = CString::new("京都東京都").unwrap();
        let status = sudachi_set_pretokenizer_debug(handle, 1);
        assert_eq!(status, OK, "{}", last_error_message());

        for (projection, expected_name) in [
            (4, "dictionary_and_surface"),
            (5, "normalized_and_surface"),
            (6, "normalized_nouns"),
        ] {
            let mut out_result = ptr::null_mut();
            let status = sudachi_pretokenize(handle, text.as_ptr(), 2, projection, &mut out_result);
            assert_eq!(status, OK, "{}", last_error_message());
            sudachi_free_pretokenized_result(out_result);

            let lines = captured.lock().unwrap();
            let last = lines.last().expect("debug log should contain a line");
            assert!(
                last.contains(&format!("\"projection\":\"{expected_name}\"")),
                "{}",
                last
            );
            drop(lines);
        }
    });
}

#[test]
fn pretokenizer_debug_setter_controls_emission() {
    with_capturing_pretokenizer(|handle, captured| {
        let text = CString::new("京都東京都").unwrap();

        let status = sudachi_set_pretokenizer_debug(handle, 1);
        assert_eq!(status, OK, "{}", last_error_message());

        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        sudachi_free_pretokenized_result(out_result);

        let lines = captured.lock().unwrap().clone();
        assert_eq!(lines.len(), 1);
        assert!(
            lines[0].starts_with(
                "{\"event\":\"pretokenize\",\"mode\":\"C\",\"split_mode\":\"C\",\"projection\":\"reading\",\"subset_bits\":"
            ),
            "{}",
            lines[0]
        );
        assert!(lines[0].contains("\"token_count\":2"), "{}", lines[0]);

        let status = sudachi_set_pretokenizer_debug(handle, 0);
        assert_eq!(status, OK, "{}", last_error_message());

        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        sudachi_free_pretokenized_result(out_result);

        assert_eq!(captured.lock().unwrap().len(), 1);
    });
}

#[test]
fn pretokenize_debug_panic_leaves_output_pointer_null() {
    with_test_pretokenizer(|handle| {
        let sink: Arc<dyn PretokenizerDebugSink> = Arc::new(PanicDebugSink);
        unsafe {
            (*handle).debug_sink = sink;
            (*handle).debug_enabled.store(true, Ordering::Relaxed);
        }

        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = super::ops::pretokenize_impl(
            handle as *const PretokenizerHandle,
            text.as_ptr(),
            Mode::C as i32,
            Mode::C as i32,
            Projection::Reading as i32,
            0,
            &mut out_result,
        );

        assert_eq!(status, ERR_PRETOKENIZE);
        assert_eq!(status_code_name(status), "PRETOKENIZE");
        assert_eq!(
            last_error_message(),
            "pretokenizer debug sink panicked while emitting debug output"
        );
        assert!(out_result.is_null());
    });
}

#[test]
fn pretokenize_preserves_byte_and_char_offsets() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_pretokenized_values(out_result);
        sudachi_free_pretokenized_result(out_result);

        assert_eq!(
            values,
            vec![
                ("キョウト".to_owned(), 0, 6, 0, 2),
                ("トウキョウト".to_owned(), 6, 15, 2, 5),
            ]
        );
    });
}

#[test]
fn pretokenize_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("a😀b").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_pretokenized_values(out_result);
        sudachi_free_pretokenized_result(out_result);

        assert!(!values.is_empty());
        for (_, begin_byte, end_byte, begin_char, end_char) in values {
            assert_eq!(begin_char, utf16_index_for_byte_offset(text_str, begin_byte));
            assert_eq!(end_char, utf16_index_for_byte_offset(text_str, end_byte));
        }
    });
}

#[test]
fn pretokenize_subset_matches_default_when_requesting_all_fields() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();

        let mut default_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut default_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let default_values = collect_pretokenized_values(default_result);
        sudachi_free_pretokenized_result(default_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_pretokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_values = collect_pretokenized_values(subset_result);
        sudachi_free_pretokenized_result(subset_result);

        assert_eq!(subset_values, default_values);
    });
}

#[test]
fn pretokenize_subset_returns_new_info_subset_fields() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let bits = InfoSubset::HEAD_WORD_LENGTH.bits()
            | InfoSubset::SPLIT_A.bits()
            | InfoSubset::SPLIT_B.bits()
            | InfoSubset::WORD_STRUCTURE.bits();
        let status = sudachi_pretokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            bits,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(item.head_word_length > 0);
            assert!(item.split_a_len > 0);
            assert!(item.word_structure_len > 0);
            let split_a = std::slice::from_raw_parts(item.split_a, item.split_a_len);
            let word_structure =
                std::slice::from_raw_parts(item.word_structure, item.word_structure_len);
            let first_split_a = CStr::from_ptr(split_a[0]).to_str().unwrap();
            let first_word_structure = CStr::from_ptr(word_structure[0]).to_str().unwrap();
            assert!(first_split_a.starts_with('('));
            assert!(first_word_structure.starts_with('('));
            if item.split_b_len == 0 {
                assert!(item.split_b.is_null());
            } else {
                let split_b = std::slice::from_raw_parts(item.split_b, item.split_b_len);
                let first_split_b = CStr::from_ptr(split_b[0]).to_str().unwrap();
                assert!(first_split_b.starts_with('('));
            }
        }

        sudachi_free_pretokenized_result(out_result);
    });
}
