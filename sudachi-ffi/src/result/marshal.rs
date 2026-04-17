use std::ffi::CString;
use std::mem;
use std::os::raw::c_char;
use std::ptr::{self, NonNull};
use std::sync::Arc;

use sudachi::analysis::mlist::MorphemeList;
use sudachi::dic::build::report::DictPartReport;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;
use sudachi::dic::word_id::WordId;

use crate::convert::Projection;
use crate::error::{ERR_INTERNAL, ERR_NULL_POINTER, error};

use super::{
    DictionaryBuildPartReport, DictionaryBuildReportArray, DictionaryBuildReportLayout,
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
    fn is_inflected_pos(morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>) -> bool {
        matches!(
            morpheme.part_of_speech().first().map(String::as_str),
            Some("動詞" | "形容詞" | "助動詞")
        )
    }

    fn uses_normalized_nouns_fallback(
        morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
    ) -> bool {
        matches!(morpheme.part_of_speech().get(5).map(String::as_str), Some("*"))
    }

    match projection {
        Projection::Surface => morpheme.surface().to_string(),
        Projection::Normalized => morpheme.normalized_form().to_string(),
        Projection::DictionaryForm => morpheme.dictionary_form().to_string(),
        Projection::Reading => morpheme.reading_form().to_string(),
        Projection::DictionaryAndSurface => {
            if is_inflected_pos(morpheme) {
                morpheme.surface().to_string()
            } else {
                morpheme.dictionary_form().to_string()
            }
        }
        Projection::NormalizedAndSurface => {
            if is_inflected_pos(morpheme) {
                morpheme.surface().to_string()
            } else {
                morpheme.normalized_form().to_string()
            }
        }
        Projection::NormalizedNouns => {
            if uses_normalized_nouns_fallback(morpheme) {
                morpheme.normalized_form().to_string()
            } else {
                morpheme.surface().to_string()
            }
        }
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
    drop(boxed_slice_from_raw_parts(ptr, len));
}

fn free_result_items<T>(items: *mut T, len: usize, mut free_item: impl FnMut(&mut T)) {
    let Some(mut boxed_items) = boxed_slice_from_raw_parts(items, len) else {
        return;
    };
    for item in boxed_items.iter_mut() {
        free_item(item);
    }
}

pub(crate) fn free_u32_slice(ptr: *mut u32, len: usize) {
    free_boxed_slice(ptr, len);
}

pub(crate) fn free_u16_slice(ptr: *mut u16, len: usize) {
    free_boxed_slice(ptr, len);
}

pub(crate) fn free_c_string_slice(ptr: *mut *mut c_char, len: usize) {
    let Some(mut boxed_items) = boxed_slice_from_raw_parts(ptr, len) else {
        return;
    };

    for item in boxed_items.iter_mut() {
        free_c_string(*item);
        *item = ptr::null_mut();
    }
}

fn boxed_slice_from_raw_parts<T>(ptr: *mut T, len: usize) -> Option<Box<[T]>> {
    if ptr.is_null() || len == 0 {
        return None;
    }

    unsafe {
        let slice = ptr::slice_from_raw_parts_mut(ptr, len);
        Some(Box::from_raw(slice))
    }
}

fn free_partial_result_items<T>(results: &mut [T], free_owned_fields: fn(&mut T)) {
    for result in results.iter_mut() {
        free_owned_fields(result);
    }
}

pub(crate) fn free_partial_results(results: &mut [MorphemeResult]) {
    free_partial_result_items(results, MorphemeResult::free_owned_fields);
}

pub(crate) fn free_partial_lookup_results(results: &mut [LookupResultItem]) {
    free_partial_result_items(results, LookupResultItem::free_owned_fields);
}

pub(crate) fn free_partial_pretokenized_results(results: &mut [PretokenizedResult]) {
    free_partial_result_items(results, PretokenizedResult::free_owned_fields);
}

fn synonym_group_ids_to_raw_parts(synonym_group_ids: Vec<u32>) -> (*mut u32, usize) {
    boxed_slice_into_raw_parts(synonym_group_ids.into_boxed_slice())
}

fn format_word_id(word_id: WordId) -> String {
    format!("{word_id:?}")
}

fn word_ids_to_strings(word_ids: &[WordId]) -> Vec<String> {
    word_ids.iter().copied().map(format_word_id).collect()
}

fn word_id_strings_to_raw_parts(word_ids: Vec<String>) -> Result<(*mut *mut c_char, usize), i32> {
    let mut strings = Vec::with_capacity(word_ids.len());
    for word_id in word_ids {
        match string_to_c(word_id) {
            Ok(ptr) => strings.push(ptr),
            Err(code) => {
                for ptr in strings {
                    free_c_string(ptr);
                }
                return Err(code);
            }
        }
    }
    Ok(boxed_slice_into_raw_parts(strings.into_boxed_slice()))
}

struct OwnedFieldsGuard<T> {
    value: T,
    empty: fn() -> T,
    free_owned_fields: fn(&mut T),
}

impl<T> OwnedFieldsGuard<T> {
    fn new(empty: fn() -> T, free_owned_fields: fn(&mut T)) -> Self {
        Self {
            value: empty(),
            empty,
            free_owned_fields,
        }
    }

    fn value_mut(&mut self) -> &mut T {
        &mut self.value
    }

    fn into_inner(mut self) -> T {
        mem::replace(&mut self.value, (self.empty)())
    }
}

impl<T> Drop for OwnedFieldsGuard<T> {
    fn drop(&mut self) {
        (self.free_owned_fields)(&mut self.value);
    }
}

fn pretokenized_item_to_result(item: PretokenizedItem) -> Result<PretokenizedResult, i32> {
    let mut result =
        OwnedFieldsGuard::new(PretokenizedResult::empty, PretokenizedResult::free_owned_fields);
    result.value_mut().surface = cloned_option_to_c(item.surface)?;
    result.value_mut().normalized = cloned_option_to_c(item.normalized)?;
    result.value_mut().dictionary_form = cloned_option_to_c(item.dictionary_form)?;
    result.value_mut().reading = cloned_option_to_c(item.reading)?;
    result.value_mut().pos = cloned_option_to_c(item.pos)?;
    result.value_mut().begin_byte = item.begin_byte;
    result.value_mut().end_byte = item.end_byte;
    result.value_mut().begin_char = item.begin_char;
    result.value_mut().end_char = item.end_char;
    result.value_mut().word_id = string_to_c(item.word_id)?;
    result.value_mut().head_word_length = item.head_word_length;
    let (split_a, split_a_len) = word_id_strings_to_raw_parts(item.split_a)?;
    result.value_mut().split_a = split_a;
    result.value_mut().split_a_len = split_a_len;
    let (split_b, split_b_len) = word_id_strings_to_raw_parts(item.split_b)?;
    result.value_mut().split_b = split_b;
    result.value_mut().split_b_len = split_b_len;
    let (word_structure, word_structure_len) =
        word_id_strings_to_raw_parts(item.word_structure)?;
    result.value_mut().word_structure = word_structure;
    result.value_mut().word_structure_len = word_structure_len;
    result.value_mut().pos_id = item.pos_id;
    result.value_mut().dictionary_id = item.dictionary_id;
    result.value_mut().is_oov = u8::from(item.is_oov);
    let (synonym_group_ids, synonym_group_ids_len) =
        synonym_group_ids_to_raw_parts(item.synonym_group_ids);
    result.value_mut().synonym_group_ids = synonym_group_ids;
    result.value_mut().synonym_group_ids_len = synonym_group_ids_len;
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
        word_id: format_word_id(morpheme.word_id()),
        head_word_length: if subset.contains(InfoSubset::HEAD_WORD_LENGTH) {
            morpheme.get_word_info().head_word_length()
        } else {
            0
        },
        split_a: if subset.contains(InfoSubset::SPLIT_A) {
            word_ids_to_strings(morpheme.get_word_info().a_unit_split())
        } else {
            Vec::new()
        },
        split_b: if subset.contains(InfoSubset::SPLIT_B) {
            word_ids_to_strings(morpheme.get_word_info().b_unit_split())
        } else {
            Vec::new()
        },
        word_structure: if subset.contains(InfoSubset::WORD_STRUCTURE) {
            word_ids_to_strings(morpheme.get_word_info().word_structure())
        } else {
            Vec::new()
        },
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
    let mut result = OwnedFieldsGuard::new(MorphemeResult::empty, MorphemeResult::free_owned_fields);
    let begin = morpheme.begin();
    let end = morpheme.end();
    if subset.contains(InfoSubset::SURFACE) {
        result.value_mut().surface = clone_string(&projected_surface_text(morpheme, projection))?;
    }
    if subset.contains(InfoSubset::NORMALIZED_FORM) {
        result.value_mut().normalized = clone_string(morpheme.normalized_form())?;
    }
    if subset.contains(InfoSubset::DIC_FORM_WORD_ID) {
        result.value_mut().dictionary_form = clone_string(morpheme.dictionary_form())?;
    }
    if subset.contains(InfoSubset::READING_FORM) {
        result.value_mut().reading = clone_string(morpheme.reading_form())?;
    }
    if include_pos_text {
        result.value_mut().pos = clone_string(&morpheme.part_of_speech().join(","))?;
    }
    result.value_mut().begin = begin;
    result.value_mut().end = end;
    result.value_mut().begin_char = offset_map.byte_to_char(begin)?;
    result.value_mut().end_char = offset_map.byte_to_char(end)?;
    result.value_mut().word_id = clone_string(&format_word_id(morpheme.word_id()))?;
    if subset.contains(InfoSubset::HEAD_WORD_LENGTH) {
        result.value_mut().head_word_length = morpheme.get_word_info().head_word_length();
    }
    if subset.contains(InfoSubset::SPLIT_A) {
        let (split_a, split_a_len) =
            word_id_strings_to_raw_parts(word_ids_to_strings(morpheme.get_word_info().a_unit_split()))?;
        result.value_mut().split_a = split_a;
        result.value_mut().split_a_len = split_a_len;
    }
    if subset.contains(InfoSubset::SPLIT_B) {
        let (split_b, split_b_len) =
            word_id_strings_to_raw_parts(word_ids_to_strings(morpheme.get_word_info().b_unit_split()))?;
        result.value_mut().split_b = split_b;
        result.value_mut().split_b_len = split_b_len;
    }
    if subset.contains(InfoSubset::WORD_STRUCTURE) {
        let (word_structure, word_structure_len) = word_id_strings_to_raw_parts(
            word_ids_to_strings(morpheme.get_word_info().word_structure()),
        )?;
        result.value_mut().word_structure = word_structure;
        result.value_mut().word_structure_len = word_structure_len;
    }
    if subset.contains(InfoSubset::POS_ID) {
        result.value_mut().pos_id = morpheme.part_of_speech_id();
    }
    result.value_mut().dictionary_id = morpheme.dictionary_id();
    result.value_mut().is_oov = u8::from(morpheme.is_oov());
    result.value_mut().total_cost = morpheme.total_cost();

    if subset.contains(InfoSubset::SYNONYM_GROUP_ID) {
        let (synonym_group_ids, synonym_group_ids_len) =
            synonym_group_ids_to_raw_parts(morpheme.synonym_group_ids().to_vec());
        result.value_mut().synonym_group_ids = synonym_group_ids;
        result.value_mut().synonym_group_ids_len = synonym_group_ids_len;
    }

    Ok(result.into_inner())
}

pub(crate) fn lookup_morpheme_to_result(
    morpheme: &sudachi::analysis::morpheme::Morpheme<'_, Arc<JapaneseDictionary>>,
    subset: InfoSubset,
    include_pos_text: bool,
    projection: Projection,
) -> Result<LookupResultItem, i32> {
    let mut result =
        OwnedFieldsGuard::new(LookupResultItem::empty, LookupResultItem::free_owned_fields);
    if subset.contains(InfoSubset::SURFACE) {
        result.value_mut().surface = clone_string(&projected_surface_text(morpheme, projection))?;
    }
    if include_pos_text {
        result.value_mut().pos = clone_string(&morpheme.part_of_speech().join(","))?;
    }
    if subset.contains(InfoSubset::POS_ID) {
        result.value_mut().pos_id = morpheme.part_of_speech_id();
    }
    result.value_mut().word_id = clone_string(&format_word_id(morpheme.word_id()))?;
    if subset.contains(InfoSubset::HEAD_WORD_LENGTH) {
        result.value_mut().head_word_length = morpheme.get_word_info().head_word_length();
    }
    if subset.contains(InfoSubset::SPLIT_A) {
        let (split_a, split_a_len) =
            word_id_strings_to_raw_parts(word_ids_to_strings(morpheme.get_word_info().a_unit_split()))?;
        result.value_mut().split_a = split_a;
        result.value_mut().split_a_len = split_a_len;
    }
    if subset.contains(InfoSubset::SPLIT_B) {
        let (split_b, split_b_len) =
            word_id_strings_to_raw_parts(word_ids_to_strings(morpheme.get_word_info().b_unit_split()))?;
        result.value_mut().split_b = split_b;
        result.value_mut().split_b_len = split_b_len;
    }
    if subset.contains(InfoSubset::WORD_STRUCTURE) {
        let (word_structure, word_structure_len) = word_id_strings_to_raw_parts(
            word_ids_to_strings(morpheme.get_word_info().word_structure()),
        )?;
        result.value_mut().word_structure = word_structure;
        result.value_mut().word_structure_len = word_structure_len;
    }
    result.value_mut().dictionary_id = morpheme.dictionary_id();
    result.value_mut().is_oov = u8::from(morpheme.is_oov());
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

pub(crate) fn dictionary_build_reports_to_array(
    reports: &[DictPartReport],
) -> Result<Box<DictionaryBuildReportArray>, i32> {
    let mut results = Vec::with_capacity(reports.len());
    for report in reports {
        let mut item = DictionaryBuildPartReport::empty();
        item.part = clone_string(report.part())?;
        item.size = report.size();
        item.elapsed_millis = report.time().as_millis() as u64;
        item.is_write = u8::from(report.is_write());
        results.push(item);
    }

    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(DictionaryBuildReportArray { items, len }))
}

pub(crate) fn free_dictionary_build_report_array(result: *mut DictionaryBuildReportArray) {
    if result.is_null() {
        return;
    }

    unsafe {
        let boxed = Box::from_raw(result);
        free_result_items(boxed.items, boxed.len, |item| item.free_owned_fields());
    }
}

pub(crate) fn dictionary_build_report_layout() -> DictionaryBuildReportLayout {
    DictionaryBuildReportLayout::new()
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
