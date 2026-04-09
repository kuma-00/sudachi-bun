use std::os::raw::c_char;

use super::ops;
use crate::result::{
    LookupResultArray, LookupResultLayout, MorphemeResultArray, MorphemeResultLayout,
    PosMatcherResultArray, PosMatcherResultLayout, SentenceSpanArray, SentenceSpanLayout,
};

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_tokenizer(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut ops::TokenizerHandle,
) -> i32 {
    ops::create_tokenizer_impl(config_path, resource_dir, dict_path, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_sentence_splitter(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut ops::SentenceSplitterHandle,
) -> i32 {
    ops::create_sentence_splitter_impl(config_path, resource_dir, dict_path, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_sentence_splitter_from_tokenizer(
    tokenizer_handle: *const ops::TokenizerHandle,
    out_handle: *mut *mut ops::SentenceSplitterHandle,
) -> i32 {
    ops::create_sentence_splitter_from_tokenizer_impl(tokenizer_handle, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_abi_version() -> i32 {
    ops::abi_version()
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_tokenizer(handle: *mut ops::TokenizerHandle) {
    ops::free_tokenizer_impl(handle);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_sentence_splitter(handle: *mut ops::SentenceSplitterHandle) {
    ops::free_sentence_splitter_impl(handle);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_tokenize(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::tokenize_impl(handle, input_utf8, mode, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_lookup(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    ops::lookup_impl(handle, input_utf8, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_compile_pos_matcher(
    handle: *const ops::TokenizerHandle,
    patterns_json: *const c_char,
    out_result: *mut *mut PosMatcherResultArray,
) -> i32 {
    ops::compile_pos_matcher_impl(handle, patterns_json, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_morpheme(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    index: usize,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::split_morpheme_impl(
        handle,
        input_utf8,
        source_mode,
        index,
        split_mode,
        out_result,
    )
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_morphemes(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::split_morphemes_impl(handle, input_utf8, source_mode, split_mode, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_sentences(
    handle: *const ops::SentenceSplitterHandle,
    input_utf8: *const c_char,
    out_result: *mut *mut SentenceSpanArray,
) -> i32 {
    ops::split_sentences_impl(handle, input_utf8, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_result(result: *mut MorphemeResultArray) {
    crate::result::free_result_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_lookup_result(result: *mut LookupResultArray) {
    crate::result::free_lookup_result_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_pos_matcher_result(result: *mut PosMatcherResultArray) {
    crate::result::free_pos_matcher_result_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_sentence_spans(result: *mut SentenceSpanArray) {
    crate::result::free_sentence_span_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_morpheme_result_layout(out_layout: *mut MorphemeResultLayout) -> i32 {
    ops::get_morpheme_result_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_lookup_result_layout(out_layout: *mut LookupResultLayout) -> i32 {
    ops::get_lookup_result_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_pos_matcher_result_layout(
    out_layout: *mut PosMatcherResultLayout,
) -> i32 {
    ops::get_pos_matcher_result_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_sentence_span_layout(out_layout: *mut SentenceSpanLayout) -> i32 {
    ops::get_sentence_span_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_last_error() -> *const c_char {
    crate::error::last_error_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_status_code_name(code: i32) -> *const c_char {
    crate::error::status_code_name_ptr(code)
}
