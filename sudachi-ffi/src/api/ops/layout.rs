use crate::result::{
    DictionaryBuildReportLayout, LookupResultLayout, MorphemeResultLayout, PosMatcherResultLayout,
    PosTupleResultLayout, PretokenizedResultLayout, SentenceSpanLayout,
    dictionary_build_report_layout, lookup_result_layout, morpheme_result_layout,
    pos_matcher_result_layout, pos_tuple_result_layout, pretokenized_result_layout,
    sentence_span_layout, write_ptr,
};

use super::dictionary::{
    DictionaryInspectionResultLayout, dictionary_inspection_result_layout,
};
use super::run_ffi;

pub(crate) fn get_morpheme_result_layout_impl(out_layout: *mut MorphemeResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            morpheme_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_dictionary_inspection_result_layout_impl(
    out_layout: *mut DictionaryInspectionResultLayout,
) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            dictionary_inspection_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_dictionary_build_report_layout_impl(
    out_layout: *mut DictionaryBuildReportLayout,
) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            dictionary_build_report_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_pretokenized_result_layout_impl(
    out_layout: *mut PretokenizedResultLayout,
) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            pretokenized_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_lookup_result_layout_impl(out_layout: *mut LookupResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            lookup_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_pos_matcher_result_layout_impl(out_layout: *mut PosMatcherResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            pos_matcher_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_pos_tuple_result_layout_impl(out_layout: *mut PosTupleResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            pos_tuple_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_sentence_span_layout_impl(out_layout: *mut SentenceSpanLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            sentence_span_layout(),
            "out_layout pointer was null",
        )
    })
}
