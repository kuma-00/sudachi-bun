use std::os::raw::c_char;
use std::sync::Arc;

use sudachi::analysis::mlist::MorphemeList;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;

use crate::convert::{cstr_to_string, projection_from_raw, Projection};
use crate::error::{error, ERR_LOOKUP};
use crate::result::{
    boxed_slice_into_raw_parts, lookup_morpheme_to_result, require_non_null, write_box_ptr,
    LookupResultArray,
};

use super::tokenize::parsed_info_subset_from_bits;
use super::{run_ffi, TokenizerHandle};

fn lookup_text_with_subset(
    tokenizer: &TokenizerHandle,
    text: &str,
    subset: InfoSubset,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    let mut morpheme_list = MorphemeList::empty(Arc::clone(&tokenizer.dictionary));
    morpheme_list.lookup(text, subset).map_err(|err| {
        error(
            ERR_LOOKUP,
            format!("dictionary lookup failed for surface {text:?}: {err}"),
        )
    })?;
    Ok(morpheme_list)
}

fn lookup_list_to_array(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
    subset: InfoSubset,
    include_pos_text: bool,
    projection: Projection,
) -> Result<Box<LookupResultArray>, i32> {
    let mut results = Vec::with_capacity(morpheme_list.len());
    for morpheme in morpheme_list.iter() {
        match lookup_morpheme_to_result(&morpheme, subset, include_pos_text, projection) {
            Ok(result) => results.push(result),
            Err(code) => {
                crate::result::free_partial_lookup_results(&mut results);
                return Err(code);
            }
        }
    }

    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(LookupResultArray { items, len }))
}

pub(crate) fn lookup_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    projection: i32,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let projection = projection_from_raw(projection)?;
        let subset = InfoSubset::all();
        let morpheme_list = lookup_text_with_subset(tokenizer, &text, subset)?;
        let array = lookup_list_to_array(&morpheme_list, subset, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn lookup_subset_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let projection = projection_from_raw(projection)?;
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        let morpheme_list = lookup_text_with_subset(tokenizer, &text, selection.subset)?;
        let array = lookup_list_to_array(
            &morpheme_list,
            selection.subset,
            selection.include_pos_text,
            projection,
        )?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}
