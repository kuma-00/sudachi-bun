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
pub struct LookupResultItem {
    pub surface: *mut c_char,
    pub pos: *mut c_char,
    pub word_id: *mut c_char,
    pub dictionary_id: i32,
    pub is_oov: u8,
}

impl LookupResultItem {
    pub(crate) fn empty() -> Self {
        Self {
            surface: ptr::null_mut(),
            pos: ptr::null_mut(),
            word_id: ptr::null_mut(),
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
    SENTENCE_SPAN_ARRAY_LAYOUT_CONTIGUOUS, SENTENCE_SPAN_LAYOUT_VERSION,
};

#[allow(unused_imports)]
pub(crate) use marshal::{
    boxed_slice_into_raw_parts, free_c_string, free_lookup_result_array,
    free_partial_lookup_results, free_partial_results, free_result_array, free_sentence_span_array,
    free_u32_slice, lookup_morpheme_to_result, lookup_result_layout, morpheme_result_layout,
    morpheme_to_result, sentence_span_layout,
};
