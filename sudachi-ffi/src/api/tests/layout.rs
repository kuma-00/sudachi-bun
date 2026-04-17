use super::super::*;
use crate::error::{ERR_NULL_POINTER, OK, status_code_name};
use crate::result::{
    DictionaryBuildReportLayout, MorphemeResultLayout, PretokenizedResultLayout,
    SentenceSpanLayout,
};
use std::mem::MaybeUninit;
use std::ptr;

#[test]
fn get_sentence_span_layout_requires_output_pointer() {
    let status = sudachi_get_sentence_span_layout(ptr::null_mut());

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn get_sentence_span_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<SentenceSpanLayout>::uninit();
    let status = sudachi_get_sentence_span_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::SENTENCE_SPAN_LAYOUT_VERSION
    );
    assert!(layout.span_size > 0);
}

#[test]
fn get_abi_version_returns_expected_value() {
    assert_eq!(sudachi_get_abi_version(), 3);
}

#[test]
fn get_dictionary_inspection_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<DictionaryInspectionResultLayout>::uninit();
    let status = sudachi_get_dictionary_inspection_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(layout.layout_version, 1);
    assert!(layout.result_size > 0);
    assert_eq!(layout.kind_offset, 0);
    assert_eq!(layout.header_version_offset, 4);
    assert_eq!(layout.is_loadable_offset, 8);
    assert_eq!(layout.kind_unknown_value, 0);
    assert_eq!(layout.kind_system_value, 1);
    assert_eq!(layout.kind_user_value, 2);
}

#[test]
fn get_dictionary_build_report_layout_requires_output_pointer() {
    let status = sudachi_get_dictionary_build_report_layout(ptr::null_mut());
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn get_dictionary_build_report_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<DictionaryBuildReportLayout>::uninit();
    let status = sudachi_get_dictionary_build_report_layout(layout.as_mut_ptr());
    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::DICTIONARY_BUILD_REPORT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.part_offset < layout.result_size);
}

#[test]
fn get_pretokenized_result_layout_requires_output_pointer() {
    let status = sudachi_get_pretokenized_result_layout(ptr::null_mut());

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn get_morpheme_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<MorphemeResultLayout>::uninit();
    let status = sudachi_get_morpheme_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::MORPHEME_RESULT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.begin_offset > 0);
    assert!(layout.begin_char_offset > 0);
    assert!(layout.end_char_offset > 0);
    assert!(layout.array_internal_cost_offset > 0);
    assert!(layout.total_cost_offset > 0);
}

#[test]
fn get_pretokenized_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<PretokenizedResultLayout>::uninit();
    let status = sudachi_get_pretokenized_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::PRETOKENIZED_RESULT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.begin_byte_offset > 0);
    assert!(layout.begin_char_offset > 0);
}
