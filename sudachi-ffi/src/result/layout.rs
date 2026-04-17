use std::mem::{offset_of, size_of};

use super::{
    DictionaryBuildPartReport, DictionaryBuildReportArray, DictionaryBuildReportLayout,
    LookupResultArray, LookupResultItem, LookupResultLayout, MorphemeResult, MorphemeResultArray,
    MorphemeResultLayout, PosMatcherResultArray, PosMatcherResultLayout, PretokenizedResult,
    PretokenizedResultArray, PretokenizedResultLayout, SentenceSpan, SentenceSpanArray,
    SentenceSpanLayout,
};

pub const DICTIONARY_BUILD_REPORT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const DICTIONARY_BUILD_REPORT_LAYOUT_VERSION: u64 = 1;
pub const MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const MORPHEME_RESULT_LAYOUT_VERSION: u64 = 4;
pub const LOOKUP_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const LOOKUP_RESULT_LAYOUT_VERSION: u64 = 2;
pub const POS_MATCHER_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const POS_MATCHER_RESULT_LAYOUT_VERSION: u64 = 1;
pub const PRETOKENIZED_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const PRETOKENIZED_RESULT_LAYOUT_VERSION: u64 = 2;
pub const SENTENCE_SPAN_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;
pub const SENTENCE_SPAN_LAYOUT_VERSION: u64 = 1;

impl DictionaryBuildReportLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: DICTIONARY_BUILD_REPORT_LAYOUT_VERSION,
            array_layout_kind: DICTIONARY_BUILD_REPORT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(DictionaryBuildReportArray, items) as u64,
            array_len_offset: offset_of!(DictionaryBuildReportArray, len) as u64,
            result_size: size_of::<DictionaryBuildPartReport>() as u64,
            part_offset: offset_of!(DictionaryBuildPartReport, part) as u64,
            size_offset: offset_of!(DictionaryBuildPartReport, size) as u64,
            elapsed_millis_offset: offset_of!(DictionaryBuildPartReport, elapsed_millis) as u64,
            is_write_offset: offset_of!(DictionaryBuildPartReport, is_write) as u64,
        }
    }
}

impl Default for DictionaryBuildReportLayout {
    fn default() -> Self {
        Self::new()
    }
}

impl MorphemeResultLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: MORPHEME_RESULT_LAYOUT_VERSION,
            array_layout_kind: MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(MorphemeResultArray, items) as u64,
            array_len_offset: offset_of!(MorphemeResultArray, len) as u64,
            array_internal_cost_offset: offset_of!(MorphemeResultArray, internal_cost) as u64,
            result_size: size_of::<MorphemeResult>() as u64,
            surface_offset: offset_of!(MorphemeResult, surface) as u64,
            normalized_offset: offset_of!(MorphemeResult, normalized) as u64,
            dictionary_form_offset: offset_of!(MorphemeResult, dictionary_form) as u64,
            reading_offset: offset_of!(MorphemeResult, reading) as u64,
            pos_offset: offset_of!(MorphemeResult, pos) as u64,
            begin_offset: offset_of!(MorphemeResult, begin) as u64,
            end_offset: offset_of!(MorphemeResult, end) as u64,
            begin_char_offset: offset_of!(MorphemeResult, begin_char) as u64,
            end_char_offset: offset_of!(MorphemeResult, end_char) as u64,
            word_id_offset: offset_of!(MorphemeResult, word_id) as u64,
            head_word_length_offset: offset_of!(MorphemeResult, head_word_length) as u64,
            split_a_offset: offset_of!(MorphemeResult, split_a) as u64,
            split_a_len_offset: offset_of!(MorphemeResult, split_a_len) as u64,
            split_b_offset: offset_of!(MorphemeResult, split_b) as u64,
            split_b_len_offset: offset_of!(MorphemeResult, split_b_len) as u64,
            word_structure_offset: offset_of!(MorphemeResult, word_structure) as u64,
            word_structure_len_offset: offset_of!(MorphemeResult, word_structure_len) as u64,
            pos_id_offset: offset_of!(MorphemeResult, pos_id) as u64,
            dictionary_id_offset: offset_of!(MorphemeResult, dictionary_id) as u64,
            is_oov_offset: offset_of!(MorphemeResult, is_oov) as u64,
            total_cost_offset: offset_of!(MorphemeResult, total_cost) as u64,
            synonym_group_ids_offset: offset_of!(MorphemeResult, synonym_group_ids) as u64,
            synonym_group_ids_len_offset: offset_of!(MorphemeResult, synonym_group_ids_len) as u64,
        }
    }
}

impl Default for MorphemeResultLayout {
    fn default() -> Self {
        Self::new()
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

impl Default for SentenceSpanLayout {
    fn default() -> Self {
        Self::new()
    }
}

impl PretokenizedResultLayout {
    pub const fn new() -> Self {
        Self {
            layout_version: PRETOKENIZED_RESULT_LAYOUT_VERSION,
            array_layout_kind: PRETOKENIZED_RESULT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(PretokenizedResultArray, items) as u64,
            array_len_offset: offset_of!(PretokenizedResultArray, len) as u64,
            result_size: size_of::<PretokenizedResult>() as u64,
            surface_offset: offset_of!(PretokenizedResult, surface) as u64,
            normalized_offset: offset_of!(PretokenizedResult, normalized) as u64,
            dictionary_form_offset: offset_of!(PretokenizedResult, dictionary_form) as u64,
            reading_offset: offset_of!(PretokenizedResult, reading) as u64,
            pos_offset: offset_of!(PretokenizedResult, pos) as u64,
            begin_byte_offset: offset_of!(PretokenizedResult, begin_byte) as u64,
            end_byte_offset: offset_of!(PretokenizedResult, end_byte) as u64,
            begin_char_offset: offset_of!(PretokenizedResult, begin_char) as u64,
            end_char_offset: offset_of!(PretokenizedResult, end_char) as u64,
            word_id_offset: offset_of!(PretokenizedResult, word_id) as u64,
            head_word_length_offset: offset_of!(PretokenizedResult, head_word_length) as u64,
            split_a_offset: offset_of!(PretokenizedResult, split_a) as u64,
            split_a_len_offset: offset_of!(PretokenizedResult, split_a_len) as u64,
            split_b_offset: offset_of!(PretokenizedResult, split_b) as u64,
            split_b_len_offset: offset_of!(PretokenizedResult, split_b_len) as u64,
            word_structure_offset: offset_of!(PretokenizedResult, word_structure) as u64,
            word_structure_len_offset: offset_of!(PretokenizedResult, word_structure_len) as u64,
            pos_id_offset: offset_of!(PretokenizedResult, pos_id) as u64,
            dictionary_id_offset: offset_of!(PretokenizedResult, dictionary_id) as u64,
            is_oov_offset: offset_of!(PretokenizedResult, is_oov) as u64,
            synonym_group_ids_offset: offset_of!(PretokenizedResult, synonym_group_ids) as u64,
            synonym_group_ids_len_offset:
                offset_of!(PretokenizedResult, synonym_group_ids_len) as u64,
        }
    }
}

impl Default for PretokenizedResultLayout {
    fn default() -> Self {
        Self::new()
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
            head_word_length_offset: offset_of!(LookupResultItem, head_word_length) as u64,
            split_a_offset: offset_of!(LookupResultItem, split_a) as u64,
            split_a_len_offset: offset_of!(LookupResultItem, split_a_len) as u64,
            split_b_offset: offset_of!(LookupResultItem, split_b) as u64,
            split_b_len_offset: offset_of!(LookupResultItem, split_b_len) as u64,
            word_structure_offset: offset_of!(LookupResultItem, word_structure) as u64,
            word_structure_len_offset: offset_of!(LookupResultItem, word_structure_len) as u64,
            pos_id_offset: offset_of!(LookupResultItem, pos_id) as u64,
            dictionary_id_offset: offset_of!(LookupResultItem, dictionary_id) as u64,
            is_oov_offset: offset_of!(LookupResultItem, is_oov) as u64,
        }
    }
}

impl Default for LookupResultLayout {
    fn default() -> Self {
        Self::new()
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

impl Default for PosMatcherResultLayout {
    fn default() -> Self {
        Self::new()
    }
}
