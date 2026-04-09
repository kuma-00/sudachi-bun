use std::os::raw::c_char;
use std::panic::{AssertUnwindSafe, catch_unwind};
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
    ERR_CONFIG, ERR_INVALID_INDEX, ERR_LOOKUP, ERR_MORPHEME_SPLIT, ERR_SENTENCE_SPLIT,
    ERR_TOKENIZE, OK, clear_last_error, error,
};
use crate::result::{
    LookupResultArray, LookupResultLayout, MorphemeResultArray, MorphemeResultLayout, SentenceSpan,
    SentenceSpanArray, SentenceSpanLayout, boxed_slice_into_raw_parts, lookup_morpheme_to_result,
    lookup_result_layout, morpheme_result_layout, morpheme_to_result, require_non_null,
    sentence_span_layout, write_box_ptr, write_ptr,
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

fn run_ffi(body: impl FnOnce() -> Result<(), i32>) -> i32 {
    clear_last_error();
    match body() {
        Ok(()) => OK,
        Err(code) => code,
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
    run_ffi(|| {
        let dictionary = load_dictionary(config_path, resource_dir, dict_path)?;
        let tokenizer = StatelessTokenizer::new(Arc::clone(&dictionary));
        let handle = Box::new(TokenizerHandle {
            dictionary,
            tokenizer,
        });

        write_box_ptr(out_handle, handle, "out_handle pointer was null")
    })
}

pub(crate) fn create_sentence_splitter_impl(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut SentenceSplitterHandle,
) -> i32 {
    run_ffi(|| {
        let dictionary = load_dictionary(config_path, resource_dir, dict_path)?;
        let handle = Box::new(SentenceSplitterHandle { dictionary });
        write_box_ptr(out_handle, handle, "out_handle pointer was null")
    })
}

pub(crate) fn create_sentence_splitter_from_tokenizer_impl(
    tokenizer_handle: *const TokenizerHandle,
    out_handle: *mut *mut SentenceSplitterHandle,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(tokenizer_handle, "tokenizer_handle pointer was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let handle = Box::new(SentenceSplitterHandle {
            dictionary: Arc::clone(&tokenizer.dictionary),
        });

        write_box_ptr(out_handle, handle, "out_handle pointer was null")
    })
}

pub(crate) fn free_tokenizer_impl(handle: *mut TokenizerHandle) {
    free_handle(handle);
}

pub(crate) fn free_sentence_splitter_impl(handle: *mut SentenceSplitterHandle) {
    free_handle(handle);
}

fn free_handle<T>(handle: *mut T) {
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
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let morpheme_list = tokenize_text(tokenizer, &text, mode)?;
        let array = morpheme_list_to_array(&morpheme_list)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn lookup_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let morpheme_list = lookup_text(tokenizer, &text)?;
        let array = lookup_list_to_array(&morpheme_list)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn split_morpheme_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    index: usize,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let source_mode = mode_from_raw(source_mode)?;
        let split_mode = mode_from_raw(split_mode)?;
        let source_list = tokenize_text(tokenizer, &text, source_mode)?;
        let split_list = split_single_morpheme(&source_list, split_mode, index)?;
        let array = morpheme_list_to_array(&split_list)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn split_morphemes_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let source_mode = mode_from_raw(source_mode)?;
        let split_mode = mode_from_raw(split_mode)?;
        let source_list = tokenize_text(tokenizer, &text, source_mode)?;
        let split_list = split_all_morphemes(&source_list, split_mode)?;
        let array = morpheme_list_to_array(&split_list)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

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

pub(crate) fn get_morpheme_result_layout_impl(out_layout: *mut MorphemeResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            morpheme_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_lookup_result_layout_impl(out_layout: *mut LookupResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            lookup_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_sentence_span_layout_impl(out_layout: *mut SentenceSpanLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            sentence_span_layout(),
            "out_layout pointer was null",
        )
    })
}
