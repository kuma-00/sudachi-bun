use super::common::*;
use super::*;
use crate::error::{ERR_INVALID_INDEX, ERR_NULL_POINTER, OK, status_code_name};
use std::ffi::{CStr, CString};
use std::ptr;
use sudachi::dic::subset::InfoSubset;

#[test]
fn tokenize_requires_output_pointer() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            0,
            Projection::Surface as i32,
            ptr::null_mut(),
        );

        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert_eq!(last_error_message(), "out_result pointer was null");
    });
}

#[test]
fn tokenize_subset_surface_projection_matches_surface_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();

        let mut compat_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            &mut compat_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let compat_values = collect_surfaces_and_offsets(compat_result);
        sudachi_free_result(compat_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_values = collect_surfaces_and_offsets(subset_result);
        sudachi_free_result(subset_result);

        assert_eq!(subset_values, compat_values);
    });
}

#[test]
fn tokenize_exposes_total_and_internal_costs() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut compat_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            &mut compat_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let compat_costs = collect_morpheme_costs(compat_result);
        sudachi_free_result(compat_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_costs = collect_morpheme_costs(subset_result);
        sudachi_free_result(subset_result);

        assert!(!compat_costs.1.is_empty());
        assert!(compat_costs.1.iter().all(|cost| *cost != i32::MAX));
        assert_eq!(compat_costs, subset_costs);
    });
}

#[test]
fn tokenize_subset_omits_unrequested_expensive_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits(),
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_morpheme_result(out_result);
        sudachi_free_result(out_result);

        assert_eq!(values.len(), 1);
        let item = &values[0];
        assert!(item.surface.is_null());
        assert!(item.normalized.is_null());
        assert!(item.dictionary_form.is_null());
        assert!(item.reading.is_null());
        assert!(item.pos.is_null());
        assert_eq!(item.pos_id, 3);
        assert!(item.synonym_group_ids.is_null());
        assert_eq!(item.synonym_group_ids_len, 0);
        assert_eq!(item.begin, 0);
        assert_eq!(item.end, 9);
    });
}

#[test]
fn tokenize_subset_returns_pos_text_when_requested() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits() | FFI_INFO_SUBSET_POS_TEXT_BIT,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(!item.pos.is_null());
            let pos = CStr::from_ptr(item.pos).to_str().unwrap();
            assert_eq!(pos, "名詞,固有名詞,地名,一般,*,*");
            assert_eq!(item.pos_id, 3);
        }

        sudachi_free_result(out_result);
    });
}

#[test]
fn tokenize_projection_changes_surface_field() {
    with_test_tokenizer(|handle| {
        let text = CString::new("食べた").unwrap();

        let mut surface_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            &mut surface_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let surface_values = collect_morpheme_texts(surface_result);
        sudachi_free_result(surface_result);

        let mut dictionary_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::DictionaryForm as i32,
            &mut dictionary_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let dictionary_values = collect_morpheme_texts(dictionary_result);
        sudachi_free_result(dictionary_result);

        let mut normalized_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Normalized as i32,
            &mut normalized_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let normalized_values = collect_morpheme_texts(normalized_result);
        sudachi_free_result(normalized_result);

        let mut reading_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut reading_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let reading_values = collect_morpheme_texts(reading_result);
        sudachi_free_result(reading_result);

        assert_eq!(dictionary_values[0].0, surface_values[0].2);
        assert_eq!(normalized_values[0].0, surface_values[0].1);
        assert_eq!(reading_values[0].0, surface_values[0].3);
    });
}

#[test]
fn tokenize_new_projection_values_match_expected_surface_choice() {
    with_test_tokenizer(|handle| {
        let text = CString::new("食べた。東京都。").unwrap();

        let mut surface_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            &mut surface_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let surface_values = collect_morpheme_texts(surface_result);
        sudachi_free_result(surface_result);

        let mut dictionary_and_surface_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            4,
            &mut dictionary_and_surface_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let dictionary_and_surface_values = collect_morpheme_texts(dictionary_and_surface_result);
        sudachi_free_result(dictionary_and_surface_result);

        let mut normalized_and_surface_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            5,
            &mut normalized_and_surface_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let normalized_and_surface_values = collect_morpheme_texts(normalized_and_surface_result);
        sudachi_free_result(normalized_and_surface_result);

        let mut normalized_nouns_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            6,
            &mut normalized_nouns_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let normalized_nouns_values = collect_morpheme_texts(normalized_nouns_result);
        sudachi_free_result(normalized_nouns_result);

        assert_eq!(dictionary_and_surface_values.len(), surface_values.len());
        assert_eq!(normalized_and_surface_values.len(), surface_values.len());
        assert_eq!(normalized_nouns_values.len(), surface_values.len());

        assert!(
            surface_values
                .iter()
                .zip(dictionary_and_surface_values.iter())
                .all(|(surface, projected)| projected.0 == surface.0 || projected.0 == surface.2)
        );
        assert!(
            surface_values
                .iter()
                .zip(normalized_and_surface_values.iter())
                .all(|(surface, projected)| projected.0 == surface.0 || projected.0 == surface.1)
        );
        assert!(
            surface_values
                .iter()
                .zip(normalized_nouns_values.iter())
                .all(|(surface, projected)| projected.0 == surface.0 || projected.0 == surface.1)
        );
    });
}

#[test]
fn tokenize_subset_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_tokenizer(|handle| {
        let text = CString::new("a😀b").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut out_result,
        );
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

#[test]
fn split_morpheme_requires_valid_index() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morpheme(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            99,
            0,
            &mut out_result,
        );

        assert_eq!(status, ERR_INVALID_INDEX);
        assert_eq!(status_code_name(status), "INVALID_INDEX");
        assert!(out_result.is_null());
        assert_eq!(
            last_error_message(),
            "morpheme index 99 out of range for 2 morphemes"
        );
    });
}

#[test]
fn split_morpheme_resplits_one_morpheme_with_original_offsets() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morpheme(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            1,
            0,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets(out_result);
        sudachi_free_result(out_result);

        assert_eq!(
            values,
            vec![("トウキョウ".to_owned(), 6, 12), ("ト".to_owned(), 12, 15)]
        );
    });
}

#[test]
fn split_morphemes_resplits_entire_list() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morphemes(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            0,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets(out_result);
        sudachi_free_result(out_result);

        assert_eq!(
            values,
            vec![
                ("キョウト".to_owned(), 0, 6),
                ("トウキョウ".to_owned(), 6, 12),
                ("ト".to_owned(), 12, 15),
            ]
        );
    });
}

#[test]
fn split_morphemes_requires_valid_mode() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morphemes(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            9,
            &mut out_result,
        );

        assert_eq!(status, crate::error::ERR_INVALID_MODE);
        assert_eq!(status_code_name(status), "INVALID_MODE");
        assert!(out_result.is_null());
        assert_eq!(last_error_message(), "mode must be 0 (A), 1 (B), or 2 (C)");
    });
}

#[test]
fn split_morphemes_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都😀東京都").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morphemes(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            0,
            &mut out_result,
        );

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
