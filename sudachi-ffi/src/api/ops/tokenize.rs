use std::os::raw::c_char;
use std::sync::Arc;

use sudachi::analysis::Mode;
use sudachi::analysis::mlist::MorphemeList;
use sudachi::analysis::stateful_tokenizer::StatefulTokenizer;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;

use crate::convert::{Projection, cstr_to_string, mode_from_raw, projection_from_raw};
use crate::error::{ERR_INTERNAL, ERR_TOKENIZE, error};
use crate::result::{
    MorphemeResultArray, boxed_slice_into_raw_parts, morpheme_to_result, require_non_null,
    write_box_ptr, Utf8OffsetMap,
};

use super::handles::{StatefulTokenizerHandle, TokenizerHandle};
use super::runtime::run_ffi;

pub(super) const FFI_INFO_SUBSET_POS_TEXT_BIT: u32 = 1 << 30;

#[derive(Clone, Copy)]
pub(super) struct ParsedInfoSubset {
    pub(super) subset: InfoSubset,
    pub(super) include_pos_text: bool,
}

pub(super) fn tokenize_text(
    tokenizer: &TokenizerHandle,
    text: &str,
    mode: Mode,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    tokenize_text_with_subset(tokenizer, text, mode, InfoSubset::all())
}

pub(super) fn info_subset_from_bits(bits: u32) -> Result<InfoSubset, i32> {
    Ok(InfoSubset::from_bits(bits)
        .ok_or_else(|| {
            error(
                ERR_INTERNAL,
                format!("invalid info subset bits: {bits:#010x}"),
            )
        })?
        .normalize())
}

pub(super) fn parsed_info_subset_from_bits(bits: u32) -> Result<ParsedInfoSubset, i32> {
    let subset_bits = bits & !FFI_INFO_SUBSET_POS_TEXT_BIT;
    let subset = info_subset_from_bits(subset_bits)?;
    let include_pos_text =
        bits & FFI_INFO_SUBSET_POS_TEXT_BIT != 0 || subset == InfoSubset::all();
    Ok(ParsedInfoSubset {
        subset,
        include_pos_text,
    })
}

pub(super) fn tokenize_text_with_subset(
    tokenizer: &TokenizerHandle,
    text: &str,
    mode: Mode,
    subset: InfoSubset,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    let mut analyzer = StatefulTokenizer::create(Arc::clone(&tokenizer.dictionary), false, mode);
    analyzer.set_subset(subset);
    analyzer.reset().push_str(text);
    analyzer.do_tokenize().map_err(|err| {
        error(
            ERR_TOKENIZE,
            format!("tokenization failed for mode {mode:?}: {err}"),
        )
    })?;
    analyzer.into_morpheme_list().map_err(|err| {
        error(
            ERR_TOKENIZE,
            format!("failed to collect tokenization results for mode {mode:?}: {err}"),
        )
    })
}

pub(super) fn morpheme_list_to_array(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
    text: &str,
    include_pos_text: bool,
    projection: Projection,
) -> Result<Box<MorphemeResultArray>, i32> {
    let mut results = Vec::with_capacity(morpheme_list.len());
    let subset = morpheme_list.subset();
    let offset_map = Utf8OffsetMap::new(text);
    for morpheme in morpheme_list.iter() {
        match morpheme_to_result(&morpheme, subset, include_pos_text, projection, &offset_map) {
            Ok(result) => results.push(result),
            Err(code) => {
                crate::result::free_partial_results(&mut results);
                return Err(code);
            }
        }
    }

    let internal_cost = morpheme_list.get_internal_cost();
    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(MorphemeResultArray {
        items,
        len,
        internal_cost,
    }))
}

pub(crate) fn create_stateful_tokenizer_from_tokenizer_impl(
    tokenizer_handle: *const TokenizerHandle,
    out_handle: *mut *mut StatefulTokenizerHandle,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(tokenizer_handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let dictionary = Arc::clone(&tokenizer.dictionary);
        let handle = Box::new(StatefulTokenizerHandle {
            tokenizer: StatefulTokenizer::create(Arc::clone(&dictionary), false, Mode::C),
            dictionary,
            include_pos_text: true,
            input_text: String::new(),
        });

        write_box_ptr(out_handle, handle, "out_handle pointer was null")
    })
}

pub(crate) fn stateful_tokenizer_reset_impl(
    handle: *mut StatefulTokenizerHandle,
    input_utf8: *const c_char,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { &mut *handle.as_ptr() };
        let input = if input_utf8.is_null() {
            None
        } else {
            Some(cstr_to_string(input_utf8)?)
        };
        handle.input_text = input.unwrap_or_default();
        let buffer = handle.tokenizer.reset();
        buffer.push_str(&handle.input_text);
        Ok(())
    })
}

pub(crate) fn stateful_tokenizer_set_mode_impl(
    handle: *mut StatefulTokenizerHandle,
    mode: i32,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { &mut *handle.as_ptr() };
        handle.tokenizer.set_mode(mode_from_raw(mode)?);
        Ok(())
    })
}

pub(crate) fn stateful_tokenizer_set_subset_impl(
    handle: *mut StatefulTokenizerHandle,
    subset_bits: u32,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { &mut *handle.as_ptr() };
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        handle.tokenizer.set_subset(selection.subset);
        handle.include_pos_text = selection.include_pos_text;
        Ok(())
    })
}

pub(crate) fn stateful_tokenizer_do_tokenize_impl(
    handle: *mut StatefulTokenizerHandle,
    projection: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { &mut *handle.as_ptr() };
        let projection = projection_from_raw(projection)?;
        handle.tokenizer.reset().push_str(&handle.input_text);
        handle.tokenizer.do_tokenize().map_err(|err| {
            error(
                ERR_TOKENIZE,
                format!("stateful tokenization failed: {err}"),
            )
        })?;
        let mut morpheme_list = MorphemeList::empty(Arc::clone(&handle.dictionary));
        morpheme_list.collect_results(&mut handle.tokenizer).map_err(|err| {
            error(
                ERR_TOKENIZE,
                format!("failed to collect stateful results: {err}"),
            )
        })?;
        let array = morpheme_list_to_array(
            &morpheme_list,
            &handle.input_text,
            handle.include_pos_text,
            projection,
        )?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn tokenize_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let projection = projection_from_raw(projection)?;
        let morpheme_list = tokenize_text_with_subset(tokenizer, &text, mode, InfoSubset::all())?;
        let array = morpheme_list_to_array(&morpheme_list, &text, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn tokenize_subset_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let projection = projection_from_raw(projection)?;
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        let morpheme_list = tokenize_text_with_subset(tokenizer, &text, mode, selection.subset)?;
        let array = morpheme_list_to_array(
            &morpheme_list,
            &text,
            selection.include_pos_text,
            projection,
        )?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}
