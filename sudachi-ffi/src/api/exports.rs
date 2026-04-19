use std::os::raw::c_char;

use super::ops;
use crate::result::{
    DictionaryBuildReportArray, DictionaryBuildReportLayout,
    LookupResultArray, LookupResultLayout, MorphemeResultArray, MorphemeResultLayout,
    PosMatcherResultArray, PosMatcherResultLayout, PosTupleResultArray, PosTupleResultLayout,
    PretokenizedResultArray, PretokenizedResultLayout, SentenceSpanArray, SentenceSpanLayout,
};
use sudachi::dic::subset::InfoSubset;

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
pub extern "C" fn sudachi_get_dictionary_inspection_result_layout(
    out_layout: *mut ops::DictionaryInspectionResultLayout,
) -> i32 {
    ops::get_dictionary_inspection_result_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_inspect_dictionary_bytes(
    bytes_ptr: *const u8,
    bytes_len: usize,
    out_result: *mut ops::DictionaryInspectionResult,
) -> i32 {
    ops::inspect_dictionary_bytes_impl(bytes_ptr, bytes_len, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_build_system_dictionary(
    matrix_path: *const c_char,
    lexicon_paths: *const *const c_char,
    lexicon_paths_len: usize,
    output_path: *const c_char,
    description: *const c_char,
    out_report: *mut *mut DictionaryBuildReportArray,
) -> i32 {
    ops::build_system_dictionary_impl(
        matrix_path,
        lexicon_paths,
        lexicon_paths_len,
        output_path,
        description,
        out_report,
    )
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_build_user_dictionary(
    system_dict_path: *const c_char,
    lexicon_paths: *const *const c_char,
    lexicon_paths_len: usize,
    output_path: *const c_char,
    description: *const c_char,
    out_report: *mut *mut DictionaryBuildReportArray,
) -> i32 {
    ops::build_user_dictionary_impl(
        system_dict_path,
        lexicon_paths,
        lexicon_paths_len,
        output_path,
        description,
        out_report,
    )
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_pretokenizer(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut ops::PretokenizerHandle,
) -> i32 {
    ops::create_pretokenizer_impl(config_path, resource_dir, dict_path, out_handle)
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
pub extern "C" fn sudachi_create_pretokenizer_from_tokenizer(
    tokenizer_handle: *const ops::TokenizerHandle,
    out_handle: *mut *mut ops::PretokenizerHandle,
) -> i32 {
    ops::create_pretokenizer_from_tokenizer_impl(tokenizer_handle, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_stateful_tokenizer_from_tokenizer(
    tokenizer_handle: *const ops::TokenizerHandle,
    out_handle: *mut *mut ops::StatefulTokenizerHandle,
) -> i32 {
    ops::create_stateful_tokenizer_from_tokenizer_impl(tokenizer_handle, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_pretokenizer(handle: *mut ops::PretokenizerHandle) {
    ops::free_pretokenizer_impl(handle);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_stateful_tokenizer(handle: *mut ops::StatefulTokenizerHandle) {
    ops::free_stateful_tokenizer_impl(handle);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_set_pretokenizer_debug(
    handle: *const ops::PretokenizerHandle,
    enabled: i32,
) -> i32 {
    ops::set_pretokenizer_debug_impl(handle, enabled)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_stateful_tokenizer_reset(
    handle: *mut ops::StatefulTokenizerHandle,
    input_utf8: *const c_char,
) -> i32 {
    ops::stateful_tokenizer_reset_impl(handle, input_utf8)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_stateful_tokenizer_set_mode(
    handle: *mut ops::StatefulTokenizerHandle,
    mode: i32,
) -> i32 {
    ops::stateful_tokenizer_set_mode_impl(handle, mode)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_stateful_tokenizer_set_subset(
    handle: *mut ops::StatefulTokenizerHandle,
    subset_bits: u32,
) -> i32 {
    ops::stateful_tokenizer_set_subset_impl(handle, subset_bits)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_stateful_tokenizer_do_tokenize(
    handle: *mut ops::StatefulTokenizerHandle,
    projection: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::stateful_tokenizer_do_tokenize_impl(handle, projection, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_tokenize(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::tokenize_impl(handle, input_utf8, mode, projection, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_tokenize_subset(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::tokenize_subset_impl(handle, input_utf8, mode, projection, subset_bits, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_lookup(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    projection: i32,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    ops::lookup_impl(handle, input_utf8, projection, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_lookup_subset(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    ops::lookup_subset_impl(handle, input_utf8, projection, subset_bits, out_result)
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
pub extern "C" fn sudachi_resolve_pos_id(
    handle: *const ops::TokenizerHandle,
    pos_id: u16,
    out_result: *mut *mut PosTupleResultArray,
) -> i32 {
    ops::resolve_pos_id_impl(handle, pos_id, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_morpheme(
    handle: *mut ops::TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    projection: i32,
    index: usize,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::split_morpheme_impl(
        handle,
        input_utf8,
        source_mode,
        projection,
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
    projection: i32,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    ops::split_morphemes_impl(handle, input_utf8, source_mode, projection, split_mode, out_result)
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
pub extern "C" fn sudachi_get_eos(
    handle: *const ops::SentenceSplitterHandle,
    input_utf8: *const c_char,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    ops::get_eos_impl(handle, input_utf8, out_eos, out_found)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_eos_with_limit(
    handle: *const ops::SentenceSplitterHandle,
    input_utf8: *const c_char,
    limit: i32,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    ops::get_eos_with_limit_impl(handle, input_utf8, limit, out_eos, out_found)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_pretokenize(
    handle: *const ops::PretokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    out_result: *mut *mut PretokenizedResultArray,
) -> i32 {
    ops::pretokenize_impl(
        handle,
        input_utf8,
        mode,
        mode,
        projection,
        InfoSubset::all().bits(),
        out_result,
    )
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_pretokenize_subset(
    handle: *const ops::PretokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut PretokenizedResultArray,
) -> i32 {
    ops::pretokenize_subset_impl(handle, input_utf8, mode, projection, subset_bits, out_result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_result(result: *mut MorphemeResultArray) {
    crate::result::free_result_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_pretokenized_result(result: *mut PretokenizedResultArray) {
    crate::result::free_pretokenized_result_array(result);
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
pub extern "C" fn sudachi_free_pos_tuple_result(result: *mut PosTupleResultArray) {
    crate::result::free_pos_tuple_result_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_sentence_spans(result: *mut SentenceSpanArray) {
    crate::result::free_sentence_span_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_dictionary_build_report(result: *mut DictionaryBuildReportArray) {
    crate::result::free_dictionary_build_report_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_morpheme_result_layout(out_layout: *mut MorphemeResultLayout) -> i32 {
    ops::get_morpheme_result_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_dictionary_build_report_layout(
    out_layout: *mut DictionaryBuildReportLayout,
) -> i32 {
    ops::get_dictionary_build_report_layout_impl(out_layout)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_pretokenized_result_layout(
    out_layout: *mut PretokenizedResultLayout,
) -> i32 {
    ops::get_pretokenized_result_layout_impl(out_layout)
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
pub extern "C" fn sudachi_get_pos_tuple_result_layout(
    out_layout: *mut PosTupleResultLayout,
) -> i32 {
    ops::get_pos_tuple_result_layout_impl(out_layout)
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
