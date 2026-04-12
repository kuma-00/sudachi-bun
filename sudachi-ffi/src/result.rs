mod layout;
mod marshal;
#[cfg(test)]
mod tests;

use std::os::raw::c_char;
use std::ptr;

#[repr(C)]
pub struct MorphemeResult {
    pub surface: *mut c_char,
    pub normalized: *mut c_char,
    pub dictionary_form: *mut c_char,
    pub reading: *mut c_char,
    pub pos: *mut c_char,
    pub begin: usize,
    pub end: usize,
    pub begin_char: usize,
    pub end_char: usize,
    pub word_id: *mut c_char,
    pub pos_id: u16,
    pub dictionary_id: i32,
    pub is_oov: u8,
    pub synonym_group_ids: *mut u32,
    pub synonym_group_ids_len: usize,
}

impl MorphemeResult {
    pub(crate) fn empty() -> Self {
        Self {
            surface: ptr::null_mut(),
            normalized: ptr::null_mut(),
            dictionary_form: ptr::null_mut(),
            reading: ptr::null_mut(),
            pos: ptr::null_mut(),
            begin: 0,
            end: 0,
            begin_char: 0,
            end_char: 0,
            word_id: ptr::null_mut(),
            pos_id: 0,
            dictionary_id: 0,
            is_oov: 0,
            synonym_group_ids: ptr::null_mut(),
            synonym_group_ids_len: 0,
        }
    }

    pub(crate) fn free_owned_fields(&mut self) {
        marshal::free_c_string(self.surface);
        marshal::free_c_string(self.normalized);
        marshal::free_c_string(self.dictionary_form);
        marshal::free_c_string(self.reading);
        marshal::free_c_string(self.pos);
        marshal::free_c_string(self.word_id);
        marshal::free_u32_slice(self.synonym_group_ids, self.synonym_group_ids_len);

        self.surface = ptr::null_mut();
        self.normalized = ptr::null_mut();
        self.dictionary_form = ptr::null_mut();
        self.reading = ptr::null_mut();
        self.pos = ptr::null_mut();
        self.word_id = ptr::null_mut();
        self.synonym_group_ids = ptr::null_mut();
        self.synonym_group_ids_len = 0;
    }
}

#[repr(C)]
pub struct MorphemeResultArray {
    pub items: *mut MorphemeResult,
    pub len: usize,
}

#[repr(C)]
pub struct PretokenizedResult {
    pub surface: *mut c_char,
    pub normalized: *mut c_char,
    pub dictionary_form: *mut c_char,
    pub reading: *mut c_char,
    pub pos: *mut c_char,
    pub begin_byte: usize,
    pub end_byte: usize,
    pub begin_char: usize,
    pub end_char: usize,
    pub word_id: *mut c_char,
    pub pos_id: u16,
    pub dictionary_id: i32,
    pub is_oov: u8,
    pub synonym_group_ids: *mut u32,
    pub synonym_group_ids_len: usize,
}

impl PretokenizedResult {
    pub(crate) fn empty() -> Self {
        Self {
            surface: ptr::null_mut(),
            normalized: ptr::null_mut(),
            dictionary_form: ptr::null_mut(),
            reading: ptr::null_mut(),
            pos: ptr::null_mut(),
            begin_byte: 0,
            end_byte: 0,
            begin_char: 0,
            end_char: 0,
            word_id: ptr::null_mut(),
            pos_id: 0,
            dictionary_id: 0,
            is_oov: 0,
            synonym_group_ids: ptr::null_mut(),
            synonym_group_ids_len: 0,
        }
    }

    pub(crate) fn free_owned_fields(&mut self) {
        marshal::free_c_string(self.surface);
        marshal::free_c_string(self.normalized);
        marshal::free_c_string(self.dictionary_form);
        marshal::free_c_string(self.reading);
        marshal::free_c_string(self.pos);
        marshal::free_c_string(self.word_id);
        marshal::free_u32_slice(self.synonym_group_ids, self.synonym_group_ids_len);

        self.surface = ptr::null_mut();
        self.normalized = ptr::null_mut();
        self.dictionary_form = ptr::null_mut();
        self.reading = ptr::null_mut();
        self.pos = ptr::null_mut();
        self.word_id = ptr::null_mut();
        self.synonym_group_ids = ptr::null_mut();
        self.synonym_group_ids_len = 0;
    }
}

#[repr(C)]
pub struct PretokenizedResultArray {
    pub items: *mut PretokenizedResult,
    pub len: usize,
}

pub(crate) struct PretokenizedItem {
    pub surface: Option<String>,
    pub normalized: Option<String>,
    pub dictionary_form: Option<String>,
    pub reading: Option<String>,
    pub pos: Option<String>,
    pub begin_byte: usize,
    pub end_byte: usize,
    pub begin_char: usize,
    pub end_char: usize,
    pub word_id: String,
    pub pos_id: u16,
    pub dictionary_id: i32,
    pub is_oov: bool,
    pub synonym_group_ids: Vec<u32>,
}

#[repr(C)]
pub struct LookupResultItem {
    pub surface: *mut c_char,
    pub pos: *mut c_char,
    pub word_id: *mut c_char,
    pub pos_id: u16,
    pub dictionary_id: i32,
    pub is_oov: u8,
}

impl LookupResultItem {
    pub(crate) fn empty() -> Self {
        Self {
            surface: ptr::null_mut(),
            pos: ptr::null_mut(),
            word_id: ptr::null_mut(),
            pos_id: 0,
            dictionary_id: 0,
            is_oov: 0,
        }
    }

    pub(crate) fn free_owned_fields(&mut self) {
        marshal::free_c_string(self.surface);
        marshal::free_c_string(self.pos);
        marshal::free_c_string(self.word_id);

        self.surface = ptr::null_mut();
        self.pos = ptr::null_mut();
        self.word_id = ptr::null_mut();
    }
}

#[repr(C)]
pub struct PosMatcherResultArray {
    pub items: *mut u16,
    pub len: usize,
}

#[repr(C)]
pub struct PosMatcherResultLayout {
    pub layout_version: u64,
    pub array_layout_kind: u64,
    pub array_items_offset: u64,
    pub array_len_offset: u64,
    pub result_size: u64,
}

#[repr(C)]
pub struct LookupResultArray {
    pub items: *mut LookupResultItem,
    pub len: usize,
}

#[repr(C)]
pub struct SentenceSpan {
    pub begin: usize,
    pub end: usize,
}

#[repr(C)]
pub struct SentenceSpanArray {
    pub items: *mut SentenceSpan,
    pub len: usize,
}

#[repr(C)]
pub struct MorphemeResultLayout {
    pub layout_version: u64,
    pub array_layout_kind: u64,
    pub array_items_offset: u64,
    pub array_len_offset: u64,
    pub result_size: u64,
    pub surface_offset: u64,
    pub normalized_offset: u64,
    pub dictionary_form_offset: u64,
    pub reading_offset: u64,
    pub pos_offset: u64,
    pub begin_offset: u64,
    pub end_offset: u64,
    pub begin_char_offset: u64,
    pub end_char_offset: u64,
    pub word_id_offset: u64,
    pub pos_id_offset: u64,
    pub dictionary_id_offset: u64,
    pub is_oov_offset: u64,
    pub synonym_group_ids_offset: u64,
    pub synonym_group_ids_len_offset: u64,
}

#[repr(C)]
pub struct PretokenizedResultLayout {
    pub layout_version: u64,
    pub array_layout_kind: u64,
    pub array_items_offset: u64,
    pub array_len_offset: u64,
    pub result_size: u64,
    pub surface_offset: u64,
    pub normalized_offset: u64,
    pub dictionary_form_offset: u64,
    pub reading_offset: u64,
    pub pos_offset: u64,
    pub begin_byte_offset: u64,
    pub end_byte_offset: u64,
    pub begin_char_offset: u64,
    pub end_char_offset: u64,
    pub word_id_offset: u64,
    pub pos_id_offset: u64,
    pub dictionary_id_offset: u64,
    pub is_oov_offset: u64,
    pub synonym_group_ids_offset: u64,
    pub synonym_group_ids_len_offset: u64,
}

#[repr(C)]
pub struct LookupResultLayout {
    pub layout_version: u64,
    pub array_layout_kind: u64,
    pub array_items_offset: u64,
    pub array_len_offset: u64,
    pub result_size: u64,
    pub surface_offset: u64,
    pub pos_offset: u64,
    pub word_id_offset: u64,
    pub pos_id_offset: u64,
    pub dictionary_id_offset: u64,
    pub is_oov_offset: u64,
}

#[repr(C)]
pub struct SentenceSpanLayout {
    pub layout_version: u64,
    pub array_layout_kind: u64,
    pub array_items_offset: u64,
    pub array_len_offset: u64,
    pub span_size: u64,
    pub begin_offset: u64,
    pub end_offset: u64,
}

#[allow(unused_imports)]
pub use layout::{
    LOOKUP_RESULT_ARRAY_LAYOUT_CONTIGUOUS, LOOKUP_RESULT_LAYOUT_VERSION,
    MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS, MORPHEME_RESULT_LAYOUT_VERSION,
    POS_MATCHER_RESULT_ARRAY_LAYOUT_CONTIGUOUS, POS_MATCHER_RESULT_LAYOUT_VERSION,
    PRETOKENIZED_RESULT_ARRAY_LAYOUT_CONTIGUOUS, PRETOKENIZED_RESULT_LAYOUT_VERSION,
    SENTENCE_SPAN_ARRAY_LAYOUT_CONTIGUOUS, SENTENCE_SPAN_LAYOUT_VERSION,
};

#[allow(unused_imports)]
pub(crate) use marshal::{
    boxed_slice_into_raw_parts, free_c_string, free_lookup_result_array,
    free_partial_lookup_results, free_partial_pretokenized_results, free_partial_results,
    free_pos_matcher_result_array, free_pretokenized_result_array, free_result_array,
    free_sentence_span_array, free_u32_slice, lookup_morpheme_to_result, lookup_result_layout,
    morpheme_list_to_pretokenized_items, morpheme_result_layout, morpheme_to_pretokenized_result,
    morpheme_to_result, pos_matcher_result_layout, pretokenized_items_to_array,
    pretokenized_result_layout, require_non_null, sentence_span_layout, write_box_ptr,
    write_ptr, Utf8OffsetMap,
};
