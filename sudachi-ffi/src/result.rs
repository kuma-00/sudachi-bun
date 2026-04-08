use std::ffi::CString;
use std::os::raw::c_char;
use std::ptr;
use std::mem::offset_of;
use std::sync::Arc;

use serde_json::json;
use sudachi::dic::dictionary::JapaneseDictionary;

use crate::error::{ERR_INTERNAL, error};

pub const MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS: u64 = 0;

#[repr(C)]
pub struct MorphemeResult {
    pub surface: *mut c_char,
    pub normalized: *mut c_char,
    pub dictionary_form: *mut c_char,
    pub reading: *mut c_char,
    pub pos: *mut c_char,
    pub begin: usize,
    pub end: usize,
    pub word_id: *mut c_char,
    pub pos_id: u16,
    pub dictionary_id: i32,
    pub is_oov: u8,
    pub synonym_group_ids: *mut u32,
    pub synonym_group_ids_len: usize,
    pub detail_json: *mut c_char,
}

impl MorphemeResult {
    pub(crate) fn empty() -> Self {
        Self {
            surface: ptr::null_mut(),
            normalized: ptr::null_mut(),
            dictionary_form: ptr::null_mut(),
            reading: ptr::null_mut(),
            pos: ptr::null_mut(),
            begin: 0,
            end: 0,
            word_id: ptr::null_mut(),
            pos_id: 0,
            dictionary_id: 0,
            is_oov: 0,
            synonym_group_ids: ptr::null_mut(),
            synonym_group_ids_len: 0,
            detail_json: ptr::null_mut(),
        }
    }

    pub(crate) fn free_owned_fields(&mut self) {
        free_c_string(self.surface);
        free_c_string(self.normalized);
        free_c_string(self.dictionary_form);
        free_c_string(self.reading);
        free_c_string(self.pos);
        free_c_string(self.word_id);
        free_c_string(self.detail_json);
        free_u32_slice(self.synonym_group_ids, self.synonym_group_ids_len);

        self.surface = ptr::null_mut();
        self.normalized = ptr::null_mut();
        self.dictionary_form = ptr::null_mut();
        self.reading = ptr::null_mut();
        self.pos = ptr::null_mut();
        self.word_id = ptr::null_mut();
        self.detail_json = ptr::null_mut();
        self.synonym_group_ids = ptr::null_mut();
        self.synonym_group_ids_len = 0;
    }
}

#[repr(C)]
pub struct MorphemeResultArray {
    pub items: *mut MorphemeResult,
    pub len: usize,
}

#[repr(C)]
pub struct MorphemeResultLayout {
    pub array_layout_kind: u64,
    pub array_items_offset: u64,
    pub array_len_offset: u64,
    pub result_size: u64,
    pub surface_offset: u64,
    pub normalized_offset: u64,
    pub dictionary_form_offset: u64,
    pub reading_offset: u64,
    pub pos_offset: u64,
    pub begin_offset: u64,
    pub end_offset: u64,
    pub word_id_offset: u64,
    pub pos_id_offset: u64,
    pub dictionary_id_offset: u64,
    pub is_oov_offset: u64,
    pub synonym_group_ids_offset: u64,
    pub synonym_group_ids_len_offset: u64,
    pub detail_json_offset: u64,
}

impl MorphemeResultLayout {
    pub const fn new() -> Self {
        Self {
            array_layout_kind: MORPHEME_RESULT_ARRAY_LAYOUT_CONTIGUOUS,
            array_items_offset: offset_of!(MorphemeResultArray, items) as u64,
            array_len_offset: offset_of!(MorphemeResultArray, len) as u64,
            result_size: std::mem::size_of::<MorphemeResult>() as u64,
            surface_offset: offset_of!(MorphemeResult, surface) as u64,
            normalized_offset: offset_of!(MorphemeResult, normalized) as u64,
            dictionary_form_offset: offset_of!(MorphemeResult, dictionary_form) as u64,
            reading_offset: offset_of!(MorphemeResult, reading) as u64,
            pos_offset: offset_of!(MorphemeResult, pos) as u64,
            begin_offset: offset_of!(MorphemeResult, begin) as u64,
            end_offset: offset_of!(MorphemeResult, end) as u64,
            word_id_offset: offset_of!(MorphemeResult, word_id) as u64,
            pos_id_offset: offset_of!(MorphemeResult, pos_id) as u64,
            dictionary_id_offset: offset_of!(MorphemeResult, dictionary_id) as u64,
            is_oov_offset: offset_of!(MorphemeResult, is_oov) as u64,
            synonym_group_ids_offset: offset_of!(MorphemeResult, synonym_group_ids) as u64,
            synonym_group_ids_len_offset: offset_of!(MorphemeResult, synonym_group_ids_len) as u64,
            detail_json_offset: offset_of!(MorphemeResult, detail_json) as u64,
        }
    }
}

fn string_to_c(ptr: String) -> Result<*mut c_char, i32> {
    CString::new(ptr)
        .map(CString::into_raw)
        .map_err(|_| error(ERR_INTERNAL, "string contained an embedded NUL"))
}

fn clone_string(value: &str) -> Result<*mut c_char, i32> {
    string_to_c(value.to_owned())
}

fn build_detail_json(
    surface: &str,
    normalized: &str,
    dictionary_form: &str,
    reading: &str,
    pos: &[String],
    begin: usize,
    end: usize,
    word_id: &str,
    pos_id: u16,
    dictionary_id: i32,
    is_oov: bool,
    synonym_group_ids: &[u32],
) -> Result<*mut c_char, i32> {
    let payload = json!({
        "surface": surface,
        "raw_surface": surface,
        "normalized_form": normalized,
        "dictionary_form": dictionary_form,
        "reading_form": reading,
        "pos": pos,
        "begin": begin,
        "end": end,
        "word_id": word_id,
        "pos_id": u32::from(pos_id),
        "dictionary_id": dictionary_id,
        "is_oov": is_oov,
        "synonym_group_ids": synonym_group_ids,
    });

    string_to_c(payload.to_string())
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

    let surface = morpheme.surface().to_string();
    let normalized = morpheme.normalized_form().to_string();
    let dictionary_form = morpheme.dictionary_form().to_string();
    let reading = morpheme.reading_form().to_string();
    let pos: Vec<String> = morpheme
        .part_of_speech()
        .iter()
        .map(|value| value.to_string())
        .collect();
    let pos_joined = pos.join(",");

    let begin = morpheme.begin();
    let end = morpheme.end();
    let pos_id = morpheme.part_of_speech_id();
    let dictionary_id = morpheme.dictionary_id();
    let is_oov = u8::from(morpheme.is_oov());
    let synonym_group_ids = morpheme.synonym_group_ids().to_vec();
    let word_id = format!("{:?}", morpheme.word_id());

    let mut result = ResultGuard::new();
    result.value.surface = clone_string(&surface)?;
    result.value.normalized = clone_string(&normalized)?;
    result.value.dictionary_form = clone_string(&dictionary_form)?;
    result.value.reading = clone_string(&reading)?;
    result.value.pos = clone_string(&pos_joined)?;
    result.value.begin = begin;
    result.value.end = end;
    result.value.word_id = clone_string(&word_id)?;
    result.value.pos_id = pos_id;
    result.value.dictionary_id = dictionary_id;
    result.value.is_oov = is_oov;
    result.value.detail_json = build_detail_json(
        &surface,
        &normalized,
        &dictionary_form,
        &reading,
        &pos,
        begin,
        end,
        &word_id,
        pos_id,
        dictionary_id,
        is_oov != 0,
        &synonym_group_ids,
    )?;

    let mut synonym_group_ids = synonym_group_ids.into_boxed_slice();
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

pub(crate) fn free_c_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }

    unsafe {
        drop(CString::from_raw(ptr));
    }
}

pub(crate) fn free_u32_slice(ptr: *mut u32, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }

    unsafe {
        let slice = ptr::slice_from_raw_parts_mut(ptr, len);
        drop(Box::from_raw(slice));
    }
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

            let slice_ptr = ptr::slice_from_raw_parts_mut(boxed.items, boxed.len);
            drop(Box::from_raw(slice_ptr));
        }
    }
}

pub(crate) fn morpheme_result_layout() -> MorphemeResultLayout {
    MorphemeResultLayout::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    #[test]
    fn free_result_accepts_null() {
        free_result_array(ptr::null_mut());
    }

    #[test]
    fn free_owned_fields_is_idempotent_for_partial_results() {
        let mut result = MorphemeResult::empty();
        result.surface = CString::new("surface").unwrap().into_raw();
        result.reading = CString::new("reading").unwrap().into_raw();
        let mut synonym_group_ids = vec![1_u32, 2, 3].into_boxed_slice();
        result.synonym_group_ids = synonym_group_ids.as_mut_ptr();
        result.synonym_group_ids_len = synonym_group_ids.len();
        std::mem::forget(synonym_group_ids);
        result.detail_json = CString::new(r#"{"ok":true}"#).unwrap().into_raw();

        result.free_owned_fields();

        assert!(result.surface.is_null());
        assert!(result.reading.is_null());
        assert!(result.synonym_group_ids.is_null());
        assert_eq!(result.synonym_group_ids_len, 0);
        assert!(result.detail_json.is_null());

        result.free_owned_fields();
    }

    #[test]
    fn layout_matches_rust_offsets() {
        let layout = MorphemeResultLayout::new();

        assert_eq!(
            layout.array_items_offset,
            offset_of!(MorphemeResultArray, items) as u64
        );
        assert_eq!(layout.array_len_offset, offset_of!(MorphemeResultArray, len) as u64);
        assert_eq!(layout.result_size, std::mem::size_of::<MorphemeResult>() as u64);
        assert_eq!(layout.surface_offset, offset_of!(MorphemeResult, surface) as u64);
        assert_eq!(layout.detail_json_offset, offset_of!(MorphemeResult, detail_json) as u64);
    }
}
