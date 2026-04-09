use super::*;
use std::ffi::CString;
use std::ptr;

#[test]
fn free_result_accepts_null() {
    free_result_array(ptr::null_mut());
}

#[test]
fn free_owned_fields_is_idempotent_for_partial_results() {
    let mut result = MorphemeResult::empty();
    result.surface = CString::new("surface").unwrap().into_raw();
    result.reading = CString::new("reading").unwrap().into_raw();
    let mut synonym_group_ids = vec![1_u32, 2, 3].into_boxed_slice();
    result.synonym_group_ids = synonym_group_ids.as_mut_ptr();
    result.synonym_group_ids_len = synonym_group_ids.len();
    std::mem::forget(synonym_group_ids);

    result.free_owned_fields();
    result.free_owned_fields();

    assert!(result.surface.is_null());
    assert!(result.reading.is_null());
    assert!(result.synonym_group_ids.is_null());
}

#[test]
fn layout_version_is_stable() {
    let layout = morpheme_result_layout();
    assert_eq!(layout.layout_version, MORPHEME_RESULT_LAYOUT_VERSION);
    assert!(layout.result_size > 0);
}

#[test]
fn free_lookup_result_accepts_null() {
    free_lookup_result_array(ptr::null_mut());
}

#[test]
fn free_lookup_owned_fields_is_idempotent_for_partial_results() {
    let mut result = LookupResultItem::empty();
    result.surface = CString::new("surface").unwrap().into_raw();
    result.pos = CString::new("pos").unwrap().into_raw();

    result.free_owned_fields();
    result.free_owned_fields();

    assert!(result.surface.is_null());
    assert!(result.pos.is_null());
    assert!(result.word_id.is_null());
}

#[test]
fn lookup_layout_version_is_stable() {
    let layout = lookup_result_layout();
    assert_eq!(layout.layout_version, LOOKUP_RESULT_LAYOUT_VERSION);
    assert!(layout.result_size > 0);
}

#[test]
fn free_sentence_span_array_accepts_null() {
    free_sentence_span_array(ptr::null_mut());
}

#[test]
fn sentence_span_layout_version_is_stable() {
    let layout = sentence_span_layout();
    assert_eq!(layout.layout_version, SENTENCE_SPAN_LAYOUT_VERSION);
    assert!(layout.span_size > 0);
}
