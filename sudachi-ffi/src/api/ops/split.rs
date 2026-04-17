use std::os::raw::c_char;
use std::sync::Arc;

use sudachi::analysis::Mode;
use sudachi::analysis::mlist::MorphemeList;
use sudachi::dic::dictionary::JapaneseDictionary;

use crate::convert::{cstr_to_string, mode_from_raw, projection_from_raw};
use crate::error::{ERR_INVALID_INDEX, ERR_MORPHEME_SPLIT, error};
use crate::result::{MorphemeResultArray, require_non_null, write_box_ptr};

use super::tokenize::{morpheme_list_to_array, tokenize_text};
use super::{TokenizerHandle, run_ffi};

fn split_single_morpheme(
    source_list: &MorphemeList<Arc<JapaneseDictionary>>,
    split_mode: Mode,
    index: usize,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    if index >= source_list.len() {
        return Err(error(
            ERR_INVALID_INDEX,
            format!(
                "morpheme index {index} out of range for {} morphemes",
                source_list.len()
            ),
        ));
    }

    let mut split_list = source_list.empty_clone();
    match source_list.split_into(split_mode, index, &mut split_list) {
        Ok(true) => Ok(split_list),
        Ok(false) => {
            source_list.copy_slice(index, index + 1, &mut split_list);
            Ok(split_list)
        }
        Err(err) => Err(error(
            ERR_MORPHEME_SPLIT,
            format!("morpheme split failed at index {index}: {err}"),
        )),
    }
}

pub(super) fn split_all_morphemes(
    source_list: &MorphemeList<Arc<JapaneseDictionary>>,
    split_mode: Mode,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    let mut split_list = source_list.empty_clone();

    for index in 0..source_list.len() {
        match source_list.split_into(split_mode, index, &mut split_list) {
            Ok(true) => {}
            Ok(false) => source_list.copy_slice(index, index + 1, &mut split_list),
            Err(err) => {
                return Err(error(
                    ERR_MORPHEME_SPLIT,
                    format!("morpheme split failed at index {index}: {err}"),
                ));
            }
        }
    }

    Ok(split_list)
}

pub(crate) fn split_morpheme_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    projection: i32,
    index: usize,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let source_mode = mode_from_raw(source_mode)?;
        let projection = projection_from_raw(projection)?;
        let split_mode = mode_from_raw(split_mode)?;
        let source_list = tokenize_text(tokenizer, &text, source_mode)?;
        let split_list = split_single_morpheme(&source_list, split_mode, index)?;
        let array = morpheme_list_to_array(&split_list, &text, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn split_morphemes_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    projection: i32,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let source_mode = mode_from_raw(source_mode)?;
        let projection = projection_from_raw(projection)?;
        let split_mode = mode_from_raw(split_mode)?;
        let source_list = tokenize_text(tokenizer, &text, source_mode)?;
        let split_list = split_all_morphemes(&source_list, split_mode)?;
        let array = morpheme_list_to_array(&split_list, &text, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}
