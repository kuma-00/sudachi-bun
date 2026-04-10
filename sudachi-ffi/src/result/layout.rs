use std::mem::{offset_of, size_of};

use super::{
    LookupResultArray, LookupResultItem, LookupResultLayout, MorphemeResult, MorphemeResultArray,
    MorphemeResultLayout, PosMatcherResultArray, PosMatcherResultLayout, SentenceSpan,
    SentenceSpanArray, SentenceSpanLayout,
};

pub const MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const MORPHEME_RESULT_LAYOUT_VERSION: u64 = 1;
pub const LOOKUP_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const LOOKUP_RESULT_LAYOUT_VERSION: u64 = 1;
pub const POS_MATCHER_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const POS_MATCHER_RESULT_LAYOUT_VERSION: u64 = 1;
pub const SENTENCE_SPAN_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const SENTENCE_SPAN_LAYOUT_VERSION: u64 = 1;

impl MorphemeResultLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: MORPHEME_RESULT_LAYOUT_VERSION,
            array_layout_kind: MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(MorphemeResultArray, items) as u64,
            array_len_offset: offset_of!(MorphemeResultArray, len) as u64,
            result_size: size_of::<MorphemeResult>() as u64,
            surface_offset: offset_of!(MorphemeResult, surface) as u64,
            normalized_offset: offset_of!(MorphemeResult, normalized) as u64,
            dictionary_form_offset: offset_of!(MorphemeResult, dictionary_form) as u64,
            reading_offset: offset_of!(MorphemeResult, reading) as u64,
            pos_offset: offset_of!(MorphemeResult, pos) as u64,
            begin_offset: offset_of!(MorphemeResult, begin) as u64,
            end_offset: offset_of!(MorphemeResult, end) as u64,
            word_id_offset: offset_of!(MorphemeResult, word_id) as u64,
            pos_id_offset: offset_of!(MorphemeResult, pos_id) as u64,
            dictionary_id_offset: offset_of!(MorphemeResult, dictionary_id) as u64,
            is_oov_offset: offset_of!(MorphemeResult, is_oov) as u64,
            synonym_group_ids_offset: offset_of!(MorphemeResult, synonym_group_ids) as u64,
            synonym_group_ids_len_offset: offset_of!(MorphemeResult, synonym_group_ids_len) as u64,
        }
    }
}

impl SentenceSpanLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: SENTENCE_SPAN_LAYOUT_VERSION,
            array_layout_kind: SENTENCE_SPAN_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(SentenceSpanArray, items) as u64,
            array_len_offset: offset_of!(SentenceSpanArray, len) as u64,
            span_size: size_of::<SentenceSpan>() as u64,
            begin_offset: offset_of!(SentenceSpan, begin) as u64,
            end_offset: offset_of!(SentenceSpan, end) as u64,
        }
    }
}

impl LookupResultLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: LOOKUP_RESULT_LAYOUT_VERSION,
            array_layout_kind: LOOKUP_RESULT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(LookupResultArray, items) as u64,
            array_len_offset: offset_of!(LookupResultArray, len) as u64,
            result_size: size_of::<LookupResultItem>() as u64,
            surface_offset: offset_of!(LookupResultItem, surface) as u64,
            pos_offset: offset_of!(LookupResultItem, pos) as u64,
            word_id_offset: offset_of!(LookupResultItem, word_id) as u64,
            pos_id_offset: offset_of!(LookupResultItem, pos_id) as u64,
            dictionary_id_offset: offset_of!(LookupResultItem, dictionary_id) as u64,
            is_oov_offset: offset_of!(LookupResultItem, is_oov) as u64,
        }
    }
}

impl PosMatcherResultLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: POS_MATCHER_RESULT_LAYOUT_VERSION,
            array_layout_kind: POS_MATCHER_RESULT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(PosMatcherResultArray, items) as u64,
            array_len_offset: offset_of!(PosMatcherResultArray, len) as u64,
            result_size: size_of::<u16>() as u64,
        }
    }
}
