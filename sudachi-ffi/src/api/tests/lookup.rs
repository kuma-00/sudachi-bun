use super::common::*;
use super::*;
use crate::error::{ERR_NULL_POINTER, OK, status_code_name};
use crate::result::LookupResultLayout;
use std::ffi::{CStr, CString};
use std::mem::MaybeUninit;
use std::ptr;
use sudachi::dic::subset::InfoSubset;

#[test]
fn lookup_requires_non_null_pointers() {
    let text = CString::new("東京都").unwrap();
    let mut out_result = ptr::null_mut();

    let status = sudachi_lookup(
        ptr::null_mut(),
        text.as_ptr(),
        Projection::Surface as i32,
        &mut out_result,
    );
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_result.is_null());

    with_test_tokenizer(|handle| {
        let status = sudachi_lookup(
            handle,
            ptr::null(),
            Projection::Surface as i32,
            &mut out_result,
        );
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert!(out_result.is_null());

        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            ptr::null_mut(),
        );
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
    });
}

#[test]
fn get_lookup_result_layout_requires_output_pointer() {
    let status = sudachi_get_lookup_result_layout(ptr::null_mut());

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn get_lookup_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<LookupResultLayout>::uninit();
    let status = sudachi_get_lookup_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::LOOKUP_RESULT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.head_word_length_offset > 0);
    assert!(layout.split_a_offset > 0);
    assert!(layout.split_a_len_offset > 0);
    assert!(layout.split_b_offset > 0);
    assert!(layout.split_b_len_offset > 0);
    assert!(layout.word_structure_offset > 0);
    assert!(layout.word_structure_len_offset > 0);
    assert!(layout.pos_id_offset > 0);
}

#[test]
fn lookup_returns_complete_match_dictionary_entries() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_lookup_values(out_result);
        sudachi_free_lookup_result(out_result);

        assert_eq!(
            values,
            vec![(
                "東京都".to_owned(),
                "名詞,固有名詞,地名,一般,*,*".to_owned(),
                "(0, 6)".to_owned(),
                0,
                0,
                3,
            )]
        );
    });
}

#[test]
fn lookup_subset_surface_projection_matches_surface_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();

        let mut compat_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut compat_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let compat_values = collect_lookup_values(compat_result);
        sudachi_free_lookup_result(compat_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_values = collect_lookup_values(subset_result);
        sudachi_free_lookup_result(subset_result);

        assert_eq!(subset_values, compat_values);
    });
}

#[test]
fn lookup_subset_omits_unrequested_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits(),
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!out_result.is_null());

        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(item.surface.is_null());
            assert!(item.pos.is_null());
            assert_eq!(item.head_word_length, 0);
            assert!(item.split_a.is_null());
            assert_eq!(item.split_a_len, 0);
            assert!(item.split_b.is_null());
            assert_eq!(item.split_b_len, 0);
            assert!(item.word_structure.is_null());
            assert_eq!(item.word_structure_len, 0);
            assert_eq!(item.pos_id, 3);
            assert!(!item.word_id.is_null());
            assert_eq!(item.dictionary_id, 0);
            assert_eq!(item.is_oov, 0);
        }

        sudachi_free_lookup_result(out_result);
    });
}

#[test]
fn lookup_subset_returns_pos_text_when_requested() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits() | FFI_INFO_SUBSET_POS_TEXT_BIT,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(item.surface.is_null());
            assert!(!item.pos.is_null());
            let pos = CStr::from_ptr(item.pos).to_str().unwrap();
            let word_id = CStr::from_ptr(item.word_id).to_str().unwrap();
            assert_eq!(pos, "名詞,固有名詞,地名,一般,*,*");
            assert_eq!(word_id, "(0, 6)");
            assert_eq!(item.dictionary_id, 0);
            assert_eq!(item.is_oov, 0);
            assert_eq!(item.pos_id, 3);
        }

        sudachi_free_lookup_result(out_result);
    });
}

#[test]
fn lookup_subset_accepts_new_info_subset_bits() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let bits = InfoSubset::POS_ID.bits()
            | InfoSubset::HEAD_WORD_LENGTH.bits()
            | InfoSubset::SPLIT_A.bits()
            | InfoSubset::SPLIT_B.bits()
            | InfoSubset::WORD_STRUCTURE.bits();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
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
            assert_eq!(item.pos_id, 3);
            assert_eq!(item.dictionary_id, 0);
            assert_eq!(item.is_oov, 0);
        }

        sudachi_free_lookup_result(out_result);
    });
}

#[test]
fn lookup_projection_changes_surface_field() {
    with_test_tokenizer(|handle| {
        let mut out_result = ptr::null_mut();
        let text = CString::new("東京").unwrap();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Reading as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_lookup_values(out_result);
        sudachi_free_lookup_result(out_result);
        assert_eq!(values[0].0, "トウキョウ");
    });
}

#[test]
fn lookup_accepts_new_projection_values() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京").unwrap();

        let mut surface_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut surface_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let surface_values = collect_lookup_values(surface_result);
        sudachi_free_lookup_result(surface_result);

        for projection in [4, 5, 6] {
            let mut out_result = ptr::null_mut();
            let status = sudachi_lookup(handle, text.as_ptr(), projection, &mut out_result);
            assert_eq!(status, OK, "{}", last_error_message());
            let values = collect_lookup_values(out_result);
            sudachi_free_lookup_result(out_result);
            assert_eq!(values.len(), surface_values.len());
            assert!(
                values
                    .iter()
                    .zip(surface_values.iter())
                    .all(|(value, surface)| value.0 == surface.0 || value.0 == "トウキョウ")
            );
        }
    });
}

#[test]
fn lookup_subset_rejects_invalid_bits() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            1u32 << 31,
            &mut out_result,
        );

        assert_eq!(status, crate::error::ERR_INTERNAL);
        assert_eq!(status_code_name(status), "INTERNAL");
        assert!(out_result.is_null());
        assert_eq!(last_error_message(), "invalid info subset bits: 0x80000000");
    });
}

#[test]
fn lookup_returns_empty_array_when_no_complete_match_exists() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_lookup_values(out_result);
        sudachi_free_lookup_result(out_result);

        assert!(values.is_empty());
    });
}
