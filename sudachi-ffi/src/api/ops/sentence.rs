use std::os::raw::c_char;
use std::panic::{catch_unwind, AssertUnwindSafe};

use sudachi::sentence_detector::{NonBreakChecker, SentenceDetector};
use sudachi::sentence_splitter::{SentenceSplitter, SplitSentences};

use super::handles::SentenceSplitterHandle;
use super::runtime::run_ffi;
use crate::convert::cstr_to_string;
use crate::error::{error, ERR_SENTENCE_SPLIT};
use crate::result::{
    boxed_slice_into_raw_parts, require_non_null, write_box_ptr, SentenceSpan, SentenceSpanArray,
};

pub(crate) fn split_sentences_impl(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    out_result: *mut *mut SentenceSpanArray,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "sentence splitter handle was null")?;
        let handle = unsafe { handle.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let split_result = catch_unwind(AssertUnwindSafe(|| {
            let splitter = SentenceSplitter::new().with_checker(handle.dictionary.lexicon());
            let spans = splitter
                .split(&text)
                .map(|(range, _)| SentenceSpan {
                    begin: range.start,
                    end: range.end,
                })
                .collect::<Vec<_>>();
            let (items, len) = boxed_slice_into_raw_parts(spans.into_boxed_slice());
            Box::new(SentenceSpanArray { items, len })
        }));

        let array = match split_result {
            Ok(array) => array,
            Err(_) => {
                return Err(error(
                    ERR_SENTENCE_SPLIT,
                    "sentence split failed due to an internal panic",
                ));
            }
        };

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

fn sentence_detector_with_limit(limit: i32) -> Result<SentenceDetector, i32> {
    if limit <= 0 {
        return Err(error(
            ERR_SENTENCE_SPLIT,
            "sentence detector limit must be greater than zero",
        ));
    }
    Ok(SentenceDetector::with_limit(limit as usize))
}

fn get_eos_inner(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    detector: SentenceDetector,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "sentence splitter handle was null")?;
        let _ = require_non_null(out_eos, "out_eos pointer was null")?;
        let _ = require_non_null(out_found, "out_found pointer was null")?;
        let handle = unsafe { handle.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let split_result = catch_unwind(AssertUnwindSafe(|| -> Result<isize, String> {
            let checker = NonBreakChecker::new(handle.dictionary.lexicon());
            detector
                .get_eos(&text, Some(&checker))
                .map_err(|err| err.to_string())
        }));

        let eos = match split_result {
            Ok(Ok(eos)) => eos,
            Ok(Err(err)) => {
                return Err(error(
                    ERR_SENTENCE_SPLIT,
                    format!("sentence eos detection failed: {err}"),
                ));
            }
            Err(_) => {
                return Err(error(
                    ERR_SENTENCE_SPLIT,
                    "sentence eos detection failed due to an internal panic",
                ));
            }
        };

        let (found, eos) = if eos >= 0 {
            (1, eos as usize)
        } else {
            (0, eos.unsigned_abs())
        };

        unsafe {
            *out_eos = eos;
            *out_found = found;
        }

        Ok(())
    })
}

pub(crate) fn get_eos_impl(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    get_eos_inner(
        handle,
        input_utf8,
        SentenceDetector::new(),
        out_eos,
        out_found,
    )
}

pub(crate) fn get_eos_with_limit_impl(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    limit: i32,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    let detector = match sentence_detector_with_limit(limit) {
        Ok(detector) => detector,
        Err(status) => return status,
    };
    get_eos_inner(handle, input_utf8, detector, out_eos, out_found)
}
