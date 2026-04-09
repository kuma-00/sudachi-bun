use std::os::raw::c_char;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::ptr::NonNull;
use std::sync::Arc;

use sudachi::analysis::mlist::MorphemeList;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::analysis::{Mode, Tokenize};
use sudachi::config::Config;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;
use sudachi::sentence_splitter::{SentenceSplitter, SplitSentences};

use crate::convert::{cstr_to_path, cstr_to_string, mode_from_raw};
use crate::error::{
    ERR_CONFIG, ERR_INVALID_INDEX, ERR_LOOKUP, ERR_MORPHEME_SPLIT, ERR_NULL_POINTER,
    ERR_SENTENCE_SPLIT, ERR_TOKENIZE, OK, clear_last_error, error,
};
use crate::result::{
    LookupResultArray, LookupResultLayout, MorphemeResultArray, MorphemeResultLayout, SentenceSpan,
    SentenceSpanArray, SentenceSpanLayout, boxed_slice_into_raw_parts, lookup_morpheme_to_result,
    lookup_result_layout, morpheme_result_layout, morpheme_to_result, sentence_span_layout,
};

#[repr(C)]
pub struct TokenizerHandle {
    pub(crate) dictionary: Arc<JapaneseDictionary>,
    pub(crate) tokenizer: StatelessTokenizer<Arc<JapaneseDictionary>>,
}

#[repr(C)]
pub struct SentenceSplitterHandle {
    pub(crate) dictionary: Arc<JapaneseDictionary>,
}

const SUDACHI_FFI_ABI_VERSION: i32 = 5;

pub(crate) fn abi_version() -> i32 {
    SUDACHI_FFI_ABI_VERSION
}

fn require_non_null<T>(ptr: *mut T, message: &'static str) -> Result<NonNull<T>, i32> {
    NonNull::new(ptr).ok_or_else(|| error(ERR_NULL_POINTER, message))
}

fn write_out<T>(out: *mut *mut T, value: Box<T>) {
    unsafe {
        *out = Box::into_raw(value);
    }
}

fn load_dictionary(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
) -> Result<Arc<JapaneseDictionary>, i32> {
    let dict_path = cstr_to_path(dict_path)?;
    let config_path = if config_path.is_null() {
        None
    } else {
        Some(cstr_to_path(config_path)?)
    };
    let resource_dir = if resource_dir.is_null() {
        None
    } else {
        Some(cstr_to_path(resource_dir)?)
    };

    let cfg = Config::new(config_path, resource_dir, Some(dict_path))
        .map_err(|err| error(ERR_CONFIG, format!("failed to build sudachi config: {err}")))?;

    let dictionary = JapaneseDictionary::from_cfg(&cfg).map_err(|err| {
        error(
            ERR_CONFIG,
            format!("failed to load sudachi dictionary: {err}"),
        )
    })?;

    Ok(Arc::new(dictionary))
}

fn tokenize_text(
    tokenizer: &TokenizerHandle,
    text: &str,
    mode: Mode,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    tokenizer
        .tokenizer
        .tokenize(text, mode, false)
        .map_err(|err| {
            error(
                ERR_TOKENIZE,
                format!("tokenization failed for mode {mode:?}: {err}"),
            )
        })
}

fn morpheme_list_to_array(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
) -> Result<Box<MorphemeResultArray>, i32> {
    let mut results = Vec::with_capacity(morpheme_list.len());
    for morpheme in morpheme_list.iter() {
        match morpheme_to_result(&morpheme) {
            Ok(result) => results.push(result),
            Err(code) => {
                crate::result::free_partial_results(&mut results);
                return Err(code);
            }
        }
    }

    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(MorphemeResultArray { items, len }))
}

fn lookup_text(
    tokenizer: &TokenizerHandle,
    text: &str,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    let mut morpheme_list = MorphemeList::empty(Arc::clone(&tokenizer.dictionary));
    morpheme_list
        .lookup(text, InfoSubset::all())
        .map_err(|err| {
            error(
                ERR_LOOKUP,
                format!("dictionary lookup failed for surface {text:?}: {err}"),
            )
        })?;
    Ok(morpheme_list)
}

fn lookup_list_to_array(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
) -> Result<Box<LookupResultArray>, i32> {
    let mut results = Vec::with_capacity(morpheme_list.len());
    for morpheme in morpheme_list.iter() {
        match lookup_morpheme_to_result(&morpheme) {
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

fn split_all_morphemes(
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

pub(crate) fn create_tokenizer_impl(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut TokenizerHandle,
) -> i32 {
    clear_last_error();

    if out_handle.is_null() {
        return error(ERR_NULL_POINTER, "out_handle pointer was null");
    }

    let dictionary = match load_dictionary(config_path, resource_dir, dict_path) {
        Ok(dictionary) => dictionary,
        Err(code) => return code,
    };

    let tokenizer = StatelessTokenizer::new(Arc::clone(&dictionary));
    let handle = Box::new(TokenizerHandle {
        dictionary,
        tokenizer,
    });

    write_out(out_handle, handle);
    OK
}

pub(crate) fn create_sentence_splitter_impl(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut SentenceSplitterHandle,
) -> i32 {
    clear_last_error();

    if out_handle.is_null() {
        return error(ERR_NULL_POINTER, "out_handle pointer was null");
    }

    let dictionary = match load_dictionary(config_path, resource_dir, dict_path) {
        Ok(dictionary) => dictionary,
        Err(code) => return code,
    };

    let handle = Box::new(SentenceSplitterHandle { dictionary });
    write_out(out_handle, handle);
    OK
}

pub(crate) fn create_sentence_splitter_from_tokenizer_impl(
    tokenizer_handle: *const TokenizerHandle,
    out_handle: *mut *mut SentenceSplitterHandle,
) -> i32 {
    clear_last_error();

    if tokenizer_handle.is_null() {
        return error(ERR_NULL_POINTER, "tokenizer_handle pointer was null");
    }
    if out_handle.is_null() {
        return error(ERR_NULL_POINTER, "out_handle pointer was null");
    }

    let tokenizer = unsafe { &*tokenizer_handle };
    let handle = Box::new(SentenceSplitterHandle {
        dictionary: Arc::clone(&tokenizer.dictionary),
    });

    write_out(out_handle, handle);
    OK
}

pub(crate) fn free_tokenizer_impl(handle: *mut TokenizerHandle) {
    if handle.is_null() {
        return;
    }

    unsafe {
        drop(Box::from_raw(handle));
    }
}

pub(crate) fn free_sentence_splitter_impl(handle: *mut SentenceSplitterHandle) {
    if handle.is_null() {
        return;
    }

    unsafe {
        drop(Box::from_raw(handle));
    }
}

pub(crate) fn tokenize_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    clear_last_error();

    if handle.is_null() {
        return error(ERR_NULL_POINTER, "tokenizer handle was null");
    }
    if out_result.is_null() {
        return error(ERR_NULL_POINTER, "out_result pointer was null");
    }

    let text = match cstr_to_string(input_utf8) {
        Ok(text) => text,
        Err(code) => return code,
    };
    let mode = match mode_from_raw(mode) {
        Ok(mode) => mode,
        Err(code) => return code,
    };

    let tokenizer = unsafe { &*handle };
    let morpheme_list = match tokenize_text(tokenizer, &text, mode) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let array = match morpheme_list_to_array(&morpheme_list) {
        Ok(array) => array,
        Err(code) => return code,
    };

    write_out(out_result, array);
    OK
}

pub(crate) fn lookup_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    clear_last_error();

    if handle.is_null() {
        return error(ERR_NULL_POINTER, "tokenizer handle was null");
    }
    if out_result.is_null() {
        return error(ERR_NULL_POINTER, "out_result pointer was null");
    }

    let text = match cstr_to_string(input_utf8) {
        Ok(text) => text,
        Err(code) => return code,
    };

    let tokenizer = unsafe { &*handle };
    let morpheme_list = match lookup_text(tokenizer, &text) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let array = match lookup_list_to_array(&morpheme_list) {
        Ok(array) => array,
        Err(code) => return code,
    };

    write_out(out_result, array);
    OK
}

pub(crate) fn split_morpheme_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    index: usize,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    clear_last_error();

    if handle.is_null() {
        return error(ERR_NULL_POINTER, "tokenizer handle was null");
    }
    if out_result.is_null() {
        return error(ERR_NULL_POINTER, "out_result pointer was null");
    }

    let text = match cstr_to_string(input_utf8) {
        Ok(text) => text,
        Err(code) => return code,
    };
    let source_mode = match mode_from_raw(source_mode) {
        Ok(mode) => mode,
        Err(code) => return code,
    };
    let split_mode = match mode_from_raw(split_mode) {
        Ok(mode) => mode,
        Err(code) => return code,
    };

    let tokenizer = unsafe { &*handle };
    let source_list = match tokenize_text(tokenizer, &text, source_mode) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let split_list = match split_single_morpheme(&source_list, split_mode, index) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let array = match morpheme_list_to_array(&split_list) {
        Ok(array) => array,
        Err(code) => return code,
    };

    write_out(out_result, array);
    OK
}

pub(crate) fn split_morphemes_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    clear_last_error();

    if handle.is_null() {
        return error(ERR_NULL_POINTER, "tokenizer handle was null");
    }
    if out_result.is_null() {
        return error(ERR_NULL_POINTER, "out_result pointer was null");
    }

    let text = match cstr_to_string(input_utf8) {
        Ok(text) => text,
        Err(code) => return code,
    };
    let source_mode = match mode_from_raw(source_mode) {
        Ok(mode) => mode,
        Err(code) => return code,
    };
    let split_mode = match mode_from_raw(split_mode) {
        Ok(mode) => mode,
        Err(code) => return code,
    };

    let tokenizer = unsafe { &*handle };
    let source_list = match tokenize_text(tokenizer, &text, source_mode) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let split_list = match split_all_morphemes(&source_list, split_mode) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let array = match morpheme_list_to_array(&split_list) {
        Ok(array) => array,
        Err(code) => return code,
    };

    write_out(out_result, array);
    OK
}

pub(crate) fn split_sentences_impl(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    out_result: *mut *mut SentenceSpanArray,
) -> i32 {
    clear_last_error();

    if handle.is_null() {
        return error(ERR_NULL_POINTER, "sentence splitter handle was null");
    }
    if out_result.is_null() {
        return error(ERR_NULL_POINTER, "out_result pointer was null");
    }

    let text = match cstr_to_string(input_utf8) {
        Ok(text) => text,
        Err(code) => return code,
    };

    let handle = unsafe { &*handle };
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
            return error(
                ERR_SENTENCE_SPLIT,
                "sentence split failed due to an internal panic",
            );
        }
    };

    write_out(out_result, array);
    OK
}

pub(crate) fn get_morpheme_result_layout_impl(out_layout: *mut MorphemeResultLayout) -> i32 {
    clear_last_error();

    if require_non_null(out_layout, "out_layout pointer was null").is_err() {
        return ERR_NULL_POINTER;
    }

    unsafe {
        *out_layout = morpheme_result_layout();
    }

    OK
}

pub(crate) fn get_lookup_result_layout_impl(out_layout: *mut LookupResultLayout) -> i32 {
    clear_last_error();

    if require_non_null(out_layout, "out_layout pointer was null").is_err() {
        return ERR_NULL_POINTER;
    }

    unsafe {
        *out_layout = lookup_result_layout();
    }

    OK
}

pub(crate) fn get_sentence_span_layout_impl(out_layout: *mut SentenceSpanLayout) -> i32 {
    clear_last_error();

    if require_non_null(out_layout, "out_layout pointer was null").is_err() {
        return ERR_NULL_POINTER;
    }

    unsafe {
        *out_layout = sentence_span_layout();
    }

    OK
}
