use std::ffi::CString;
use std::mem;
use std::os::raw::c_char;
use std::ptr;
use std::sync::Arc;

use sudachi::dic::dictionary::JapaneseDictionary;

use crate::error::{ERR_INTERNAL, error};

use super::{
    LookupResultItem, LookupResultLayout, MorphemeResult, MorphemeResultArray,
    MorphemeResultLayout, SentenceSpanArray, SentenceSpanLayout,
};

pub(crate) fn boxed_slice_into_raw_parts<T>(mut boxed: Box<[T]>) -> (*mut T, usize) {
    let len = boxed.len();
    if len == 0 {
        return (ptr::null_mut(), 0);
    }

    let items = boxed.as_mut_ptr();
    mem::forget(boxed);
    (items, len)
}

fn string_to_c(ptr: String) -> Result<*mut c_char, i32> {
    CString::new(ptr)
        .map(CString::into_raw)
        .map_err(|_| error(ERR_INTERNAL, "string contained an embedded NUL"))
}

fn clone_string(value: &str) -> Result<*mut c_char, i32> {
    string_to_c(value.to_owned())
}

pub(crate) fn free_c_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }

    unsafe {
        drop(CString::from_raw(ptr));
    }
}

fn free_boxed_slice<T>(ptr: *mut T, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }

    unsafe {
        let slice = ptr::slice_from_raw_parts_mut(ptr, len);
        drop(Box::from_raw(slice));
    }
}

pub(crate) fn free_u32_slice(ptr: *mut u32, len: usize) {
    free_boxed_slice(ptr, len);
}

pub(crate) fn free_partial_results(results: &mut [MorphemeResult]) {
    for result in results.iter_mut() {
        result.free_owned_fields();
    }
}

pub(crate) fn free_partial_lookup_results(results: &mut [LookupResultItem]) {
    for result in results.iter_mut() {
        result.free_owned_fields();
    }
}

pub(crate) fn morpheme_to_result(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
) -> Result<MorphemeResult, i32> {
    struct ResultGuard {
        value: MorphemeResult,
    }

    impl ResultGuard {
        fn new() -> Self {
            Self {
                value: MorphemeResult::empty(),
            }
        }

        fn into_inner(mut self) -> MorphemeResult {
            std::mem::replace(&mut self.value, MorphemeResult::empty())
        }
    }

    impl Drop for ResultGuard {
        fn drop(&mut self) {
            self.value.free_owned_fields();
        }
    }

    let mut result = ResultGuard::new();
    result.value.surface = clone_string(&morpheme.surface().to_string())?;
    result.value.normalized = clone_string(&morpheme.normalized_form().to_string())?;
    result.value.dictionary_form = clone_string(&morpheme.dictionary_form().to_string())?;
    result.value.reading = clone_string(&morpheme.reading_form().to_string())?;
    result.value.pos = clone_string(&morpheme.part_of_speech().join(","))?;
    result.value.begin = morpheme.begin();
    result.value.end = morpheme.end();
    result.value.word_id = clone_string(&format!("{:?}", morpheme.word_id()))?;
    result.value.pos_id = morpheme.part_of_speech_id();
    result.value.dictionary_id = morpheme.dictionary_id();
    result.value.is_oov = u8::from(morpheme.is_oov());

    let mut synonym_group_ids = morpheme.synonym_group_ids().to_vec().into_boxed_slice();
    let synonym_group_ids_len = synonym_group_ids.len();
    let synonym_group_ids_ptr = if synonym_group_ids_len == 0 {
        ptr::null_mut()
    } else {
        let ptr = synonym_group_ids.as_mut_ptr();
        std::mem::forget(synonym_group_ids);
        ptr
    };

    result.value.synonym_group_ids = synonym_group_ids_ptr;
    result.value.synonym_group_ids_len = synonym_group_ids_len;

    Ok(result.into_inner())
}

pub(crate) fn lookup_morpheme_to_result(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
) -> Result<LookupResultItem, i32> {
    struct ResultGuard {
        value: LookupResultItem,
    }

    impl ResultGuard {
        fn new() -> Self {
            Self {
                value: LookupResultItem::empty(),
            }
        }

        fn into_inner(mut self) -> LookupResultItem {
            std::mem::replace(&mut self.value, LookupResultItem::empty())
        }
    }

    impl Drop for ResultGuard {
        fn drop(&mut self) {
            self.value.free_owned_fields();
        }
    }

    let mut result = ResultGuard::new();
    result.value.surface = clone_string(&morpheme.surface().to_string())?;
    result.value.pos = clone_string(&morpheme.part_of_speech().join(","))?;
    result.value.word_id = clone_string(&format!("{:?}", morpheme.word_id()))?;
    result.value.dictionary_id = morpheme.dictionary_id();
    result.value.is_oov = u8::from(morpheme.is_oov());
    Ok(result.into_inner())
}

pub(crate) fn free_result_array(result: *mut MorphemeResultArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        if !boxed.items.is_null() && boxed.len != 0 {
            let slice = std::slice::from_raw_parts_mut(boxed.items, boxed.len);
            for item in slice.iter_mut() {
                item.free_owned_fields();
            }

            free_boxed_slice(boxed.items, boxed.len);
        }
    }
}

pub(crate) fn morpheme_result_layout() -> MorphemeResultLayout {
    MorphemeResultLayout::new()
}

pub(crate) fn free_lookup_result_array(result: *mut super::LookupResultArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        if !boxed.items.is_null() && boxed.len != 0 {
            let slice = std::slice::from_raw_parts_mut(boxed.items, boxed.len);
            for item in slice.iter_mut() {
                item.free_owned_fields();
            }

            free_boxed_slice(boxed.items, boxed.len);
        }
    }
}

pub(crate) fn lookup_result_layout() -> LookupResultLayout {
    LookupResultLayout::new()
}

pub(crate) fn free_sentence_span_array(result: *mut SentenceSpanArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        free_boxed_slice(boxed.items, boxed.len);
    }
}

pub(crate) fn sentence_span_layout() -> SentenceSpanLayout {
    SentenceSpanLayout::new()
}
