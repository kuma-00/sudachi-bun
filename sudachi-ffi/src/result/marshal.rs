use std::ffi::CString;
use std::mem;
use std::os::raw::c_char;
use std::ptr::{self, NonNull};
use std::sync::Arc;

use sudachi::analysis::mlist::MorphemeList;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;

use crate::convert::Projection;
use crate::error::{ERR_INTERNAL, ERR_NULL_POINTER, error};

use super::{
    LookupResultItem, LookupResultLayout, MorphemeResult, MorphemeResultArray,
    MorphemeResultLayout, PosMatcherResultArray, PosMatcherResultLayout, PretokenizedItem,
    PretokenizedResult, PretokenizedResultArray, PretokenizedResultLayout, SentenceSpanArray,
    SentenceSpanLayout,
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

pub(crate) fn require_non_null<T>(ptr: *const T, message: &'static str) -> Result<NonNull<T>, i32> {
    NonNull::new(ptr as *mut T).ok_or_else(|| error(ERR_NULL_POINTER, message))
}

pub(crate) fn write_ptr<T>(ptr: *mut T, value: T, message: &'static str) -> Result<(), i32> {
    let ptr = require_non_null(ptr, message)?;
    unsafe {
        *ptr.as_ptr() = value;
    }
    Ok(())
}

pub(crate) fn write_box_ptr<T>(
    ptr: *mut *mut T,
    value: Box<T>,
    message: &'static str,
) -> Result<(), i32> {
    let ptr = require_non_null(ptr, message)?;
    unsafe {
        *ptr.as_ptr() = Box::into_raw(value);
    }
    Ok(())
}

fn string_to_c(ptr: String) -> Result<*mut c_char, i32> {
    CString::new(ptr)
        .map(CString::into_raw)
        .map_err(|_| error(ERR_INTERNAL, "string contained an embedded NUL"))
}

fn clone_string(value: &str) -> Result<*mut c_char, i32> {
    string_to_c(value.to_owned())
}

fn projected_surface_text(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
    projection: Projection,
) -> String {
    match projection {
        Projection::Surface => morpheme.surface().to_string(),
        Projection::Normalized => morpheme.normalized_form().to_string(),
        Projection::DictionaryForm => morpheme.dictionary_form().to_string(),
        Projection::Reading => morpheme.reading_form().to_string(),
    }
}

pub(crate) struct Utf8OffsetMap {
    byte_to_char: Vec<usize>,
}

impl Utf8OffsetMap {
    pub(crate) fn new(text: &str) -> Self {
        let mut byte_to_char = vec![usize::MAX; text.len() + 1];
        let mut char_index = 0usize;
        for (byte_index, ch) in text.char_indices() {
            byte_to_char[byte_index] = char_index;
            char_index += ch.len_utf16();
        }
        byte_to_char[text.len()] = char_index;
        Self { byte_to_char }
    }

    pub(crate) fn byte_to_char(&self, byte_offset: usize) -> Result<usize, i32> {
        let Some(value) = self.byte_to_char.get(byte_offset).copied() else {
            return Err(error(
                ERR_INTERNAL,
                format!(
                    "pretokenizer byte offset {byte_offset} is out of range for the input",
                ),
            ));
        };

        if value == usize::MAX {
            return Err(error(
                ERR_INTERNAL,
                format!(
                    "pretokenizer byte offset {byte_offset} does not align to a UTF-8 boundary",
                ),
            ));
        }

        Ok(value)
    }
}

fn cloned_option_to_c(value: Option<String>) -> Result<*mut c_char, i32> {
    match value {
        Some(value) => string_to_c(value),
        None => Ok(ptr::null_mut()),
    }
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

fn free_result_items<T>(items: *mut T, len: usize, mut free_item: impl FnMut(&mut T)) {
    if items.is_null() || len == 0 {
        return;
    }

    unsafe {
        let slice = ptr::slice_from_raw_parts_mut(items, len);
        for item in (&mut *slice).iter_mut() {
            free_item(item);
        }

        drop(Box::from_raw(slice));
    }
}

pub(crate) fn free_u32_slice(ptr: *mut u32, len: usize) {
    free_boxed_slice(ptr, len);
}

pub(crate) fn free_u16_slice(ptr: *mut u16, len: usize) {
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

pub(crate) fn free_partial_pretokenized_results(results: &mut [PretokenizedResult]) {
    for result in results.iter_mut() {
        result.free_owned_fields();
    }
}

fn pretokenized_item_to_result(item: PretokenizedItem) -> Result<PretokenizedResult, i32> {
    struct ResultGuard {
        value: PretokenizedResult,
    }

    impl ResultGuard {
        fn new() -> Self {
            Self {
                value: PretokenizedResult::empty(),
            }
        }

        fn into_inner(mut self) -> PretokenizedResult {
            std::mem::replace(&mut self.value, PretokenizedResult::empty())
        }
    }

    impl Drop for ResultGuard {
        fn drop(&mut self) {
            self.value.free_owned_fields();
        }
    }

    let mut result = ResultGuard::new();
    result.value.surface = cloned_option_to_c(item.surface)?;
    result.value.normalized = cloned_option_to_c(item.normalized)?;
    result.value.dictionary_form = cloned_option_to_c(item.dictionary_form)?;
    result.value.reading = cloned_option_to_c(item.reading)?;
    result.value.pos = cloned_option_to_c(item.pos)?;
    result.value.begin_byte = item.begin_byte;
    result.value.end_byte = item.end_byte;
    result.value.begin_char = item.begin_char;
    result.value.end_char = item.end_char;
    result.value.word_id = string_to_c(item.word_id)?;
    result.value.pos_id = item.pos_id;
    result.value.dictionary_id = item.dictionary_id;
    result.value.is_oov = u8::from(item.is_oov);
    if !item.synonym_group_ids.is_empty() {
        let mut synonym_group_ids = item.synonym_group_ids.into_boxed_slice();
        let synonym_group_ids_len = synonym_group_ids.len();
        let synonym_group_ids_ptr = synonym_group_ids.as_mut_ptr();
        std::mem::forget(synonym_group_ids);
        result.value.synonym_group_ids = synonym_group_ids_ptr;
        result.value.synonym_group_ids_len = synonym_group_ids_len;
    }
    Ok(result.into_inner())
}

pub(crate) fn morpheme_to_pretokenized_result(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
    subset: InfoSubset,
    include_pos_text: bool,
    projection: Projection,
    offset_map: &Utf8OffsetMap,
) -> Result<PretokenizedItem, i32> {
    let begin_byte = morpheme.begin();
    let end_byte = morpheme.end();
    let begin_char = offset_map.byte_to_char(begin_byte)?;
    let end_char = offset_map.byte_to_char(end_byte)?;

    Ok(PretokenizedItem {
        surface: subset.contains(InfoSubset::SURFACE)
            .then(|| projected_surface_text(morpheme, projection)),
        normalized: subset
            .contains(InfoSubset::NORMALIZED_FORM)
            .then(|| morpheme.normalized_form().to_string()),
        dictionary_form: subset
            .contains(InfoSubset::DIC_FORM_WORD_ID)
            .then(|| morpheme.dictionary_form().to_string()),
        reading: subset
            .contains(InfoSubset::READING_FORM)
            .then(|| morpheme.reading_form().to_string()),
        pos: include_pos_text.then(|| morpheme.part_of_speech().join(",")),
        begin_byte,
        end_byte,
        begin_char,
        end_char,
        word_id: format!("{:?}", morpheme.word_id()),
        pos_id: if subset.contains(InfoSubset::POS_ID) {
            morpheme.part_of_speech_id()
        } else {
            0
        },
        dictionary_id: morpheme.dictionary_id(),
        is_oov: morpheme.is_oov(),
        synonym_group_ids: if subset.contains(InfoSubset::SYNONYM_GROUP_ID) {
            morpheme.synonym_group_ids().to_vec()
        } else {
            Vec::new()
        },
    })
}

pub(crate) fn morpheme_list_to_pretokenized_items(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
    text: &str,
    include_pos_text: bool,
    projection: Projection,
) -> Result<Vec<PretokenizedItem>, i32> {
    let offset_map = Utf8OffsetMap::new(text);
    let mut results = Vec::with_capacity(morpheme_list.len());
    let subset = morpheme_list.subset();
    for morpheme in morpheme_list.iter() {
        match morpheme_to_pretokenized_result(
            &morpheme,
            subset,
            include_pos_text,
            projection,
            &offset_map,
        ) {
            Ok(result) => results.push(result),
            Err(code) => {
                return Err(code);
            }
        }
    }

    Ok(results)
}

pub(crate) fn pretokenized_items_to_array(
    items: Vec<PretokenizedItem>,
) -> Result<Box<PretokenizedResultArray>, i32> {
    let mut results = Vec::with_capacity(items.len());
    for item in items {
        match pretokenized_item_to_result(item) {
            Ok(result) => results.push(result),
            Err(code) => {
                free_partial_pretokenized_results(&mut results);
                return Err(code);
            }
        }
    }

    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(PretokenizedResultArray { items, len }))
}

pub(crate) fn morpheme_to_result(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
    subset: InfoSubset,
    include_pos_text: bool,
    projection: Projection,
    offset_map: &Utf8OffsetMap,
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
    if subset.contains(InfoSubset::SURFACE) {
        result.value.surface = clone_string(&projected_surface_text(morpheme, projection))?;
    }
    if subset.contains(InfoSubset::NORMALIZED_FORM) {
        result.value.normalized = clone_string(morpheme.normalized_form())?;
    }
    if subset.contains(InfoSubset::DIC_FORM_WORD_ID) {
        result.value.dictionary_form = clone_string(morpheme.dictionary_form())?;
    }
    if subset.contains(InfoSubset::READING_FORM) {
        result.value.reading = clone_string(morpheme.reading_form())?;
    }
    if include_pos_text {
        result.value.pos = clone_string(&morpheme.part_of_speech().join(","))?;
    }
    result.value.begin = morpheme.begin();
    result.value.end = morpheme.end();
    result.value.begin_char = offset_map.byte_to_char(result.value.begin)?;
    result.value.end_char = offset_map.byte_to_char(result.value.end)?;
    result.value.word_id = clone_string(&format!("{:?}", morpheme.word_id()))?;
    if subset.contains(InfoSubset::POS_ID) {
        result.value.pos_id = morpheme.part_of_speech_id();
    }
    result.value.dictionary_id = morpheme.dictionary_id();
    result.value.is_oov = u8::from(morpheme.is_oov());

    if subset.contains(InfoSubset::SYNONYM_GROUP_ID) {
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
    }

    Ok(result.into_inner())
}

pub(crate) fn lookup_morpheme_to_result(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
    subset: InfoSubset,
    include_pos_text: bool,
    projection: Projection,
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
    if subset.contains(InfoSubset::SURFACE) {
        result.value.surface = clone_string(&projected_surface_text(morpheme, projection))?;
    }
    if include_pos_text {
        result.value.pos = clone_string(&morpheme.part_of_speech().join(","))?;
    }
    if subset.contains(InfoSubset::POS_ID) {
        result.value.pos_id = morpheme.part_of_speech_id();
    }
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
        free_result_items(boxed.items, boxed.len, |item| item.free_owned_fields());
    }
}

pub(crate) fn morpheme_result_layout() -> MorphemeResultLayout {
    MorphemeResultLayout::new()
}

pub(crate) fn free_pretokenized_result_array(result: *mut PretokenizedResultArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        free_result_items(boxed.items, boxed.len, |item| item.free_owned_fields());
    }
}

pub(crate) fn pretokenized_result_layout() -> PretokenizedResultLayout {
    PretokenizedResultLayout::new()
}

pub(crate) fn free_lookup_result_array(result: *mut super::LookupResultArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        free_result_items(boxed.items, boxed.len, |item| item.free_owned_fields());
    }
}

pub(crate) fn lookup_result_layout() -> LookupResultLayout {
    LookupResultLayout::new()
}

pub(crate) fn pos_matcher_result_layout() -> PosMatcherResultLayout {
    PosMatcherResultLayout::new()
}

pub(crate) fn free_pos_matcher_result_array(result: *mut PosMatcherResultArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        free_u16_slice(boxed.items, boxed.len);
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct DropCounter(Arc<AtomicUsize>);

    impl Drop for DropCounter {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn write_box_ptr_drops_value_when_output_pointer_is_null() {
        let drops = Arc::new(AtomicUsize::new(0));
        let value = Box::new(DropCounter(Arc::clone(&drops)));

        let status = write_box_ptr(std::ptr::null_mut(), value, "out pointer was null");

        assert_eq!(status, Err(crate::error::ERR_NULL_POINTER));
        assert_eq!(drops.load(Ordering::SeqCst), 1);
    }
}
