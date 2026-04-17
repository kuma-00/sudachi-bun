use std::os::raw::c_char;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::Ordering;
use std::time::Instant;

use crate::convert::{cstr_to_string, mode_from_raw, projection_from_raw};
use crate::error::{ERR_PRETOKENIZE, ERR_TOKENIZE, error};
use crate::result::{
    PretokenizedResultArray, pretokenized_items_to_array, require_non_null, write_box_ptr,
};

use super::handles::{
    PretokenizeDebugRecord, PretokenizeSettings, PretokenizerHandle, emit_pretokenizer_debug,
};
use super::runtime::run_ffi;
use super::tokenize::parsed_info_subset_from_bits;

fn remap_pretokenize_status(code: i32) -> i32 {
    if code == ERR_TOKENIZE {
        ERR_PRETOKENIZE
    } else {
        code
    }
}

pub(crate) fn set_pretokenizer_debug_impl(
    handle: *const PretokenizerHandle,
    enabled: i32,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "pretokenizer handle was null")?;
        let handle = unsafe { handle.as_ref() };
        handle.debug_enabled.store(enabled != 0, Ordering::Relaxed);
        Ok(())
    })
}

pub(crate) fn pretokenize_impl(
    handle: *const PretokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    split_mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut PretokenizedResultArray,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "pretokenizer handle was null")?;
        let handle = unsafe { handle.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let split_mode = mode_from_raw(split_mode)?;
        let projection = projection_from_raw(projection)?;
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        let debug_enabled = handle.debug_enabled.load(Ordering::Relaxed);
        let started = debug_enabled.then(Instant::now);
        let items = handle
            .core
            .pretokenize(
                &text,
                PretokenizeSettings {
                    mode,
                    split_mode,
                    subset: selection.subset,
                    include_pos_text: selection.include_pos_text,
                    projection,
                    debug: debug_enabled,
                },
            )
            .map_err(remap_pretokenize_status)?;
        let token_count = items.len();
        if debug_enabled {
            let debug_record = PretokenizeDebugRecord {
                mode,
                split_mode,
                projection,
                subset_bits,
                include_pos_text: selection.include_pos_text,
                input_bytes: text.len(),
                token_count,
                elapsed_us: started
                    .expect("debug timing not captured")
                    .elapsed()
                    .as_micros(),
            };
            let debug_result = catch_unwind(AssertUnwindSafe(|| {
                emit_pretokenizer_debug(handle, &debug_record);
            }));
            if debug_result.is_err() {
                return Err(error(
                    ERR_PRETOKENIZE,
                    "pretokenizer debug sink panicked while emitting debug output",
                ));
            }
        }
        let array = pretokenized_items_to_array(items)?;
        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn pretokenize_subset_impl(
    handle: *const PretokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut PretokenizedResultArray,
) -> i32 {
    pretokenize_impl(
        handle,
        input_utf8,
        mode,
        mode,
        projection,
        subset_bits,
        out_result,
    )
}
