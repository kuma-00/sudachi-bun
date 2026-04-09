use std::mem;
use std::os::raw::c_char;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::ptr;
use std::sync::Arc;

use sudachi::analysis::Tokenize;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::config::Config;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::sentence_splitter::{SentenceSplitter, SplitSentences};

use crate::convert::{cstr_to_path, cstr_to_string, mode_from_raw};
use crate::error::{
    ERR_CONFIG, ERR_NULL_POINTER, ERR_SENTENCE_SPLIT, ERR_TOKENIZE, OK, clear_last_error, error,
    last_error_ptr, status_code_name_ptr,
};
use crate::result::{
    MorphemeResult, MorphemeResultArray, MorphemeResultLayout, SentenceSpan, SentenceSpanArray,
    SentenceSpanLayout, free_result_array, free_sentence_span_array, morpheme_result_layout,
    morpheme_to_result, sentence_span_layout,
};

#[repr(C)]
pub struct TokenizerHandle {
    dictionary: Arc<JapaneseDictionary>,
    tokenizer: StatelessTokenizer<Arc<JapaneseDictionary>>,
}

#[repr(C)]
pub struct SentenceSplitterHandle {
    dictionary: Arc<JapaneseDictionary>,
}

fn free_partial_results(results: &mut [MorphemeResult]) {
    for result in results.iter_mut() {
        result.free_owned_fields();
    }
}

const SUDACHI_FFI_ABI_VERSION: i32 = 3;

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

fn boxed_slice_into_raw_parts<T>(mut boxed: Box<[T]>) -> (*mut T, usize) {
    let len = boxed.len();
    if len == 0 {
        return (ptr::null_mut(), 0);
    }

    let items = boxed.as_mut_ptr();
    mem::forget(boxed);
    (items, len)
}

fn create_tokenizer_impl(
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

    unsafe {
        *out_handle = Box::into_raw(handle);
    }

    OK
}

fn create_sentence_splitter_impl(
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
    unsafe {
        *out_handle = Box::into_raw(handle);
    }

    OK
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_tokenizer(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut TokenizerHandle,
) -> i32 {
    create_tokenizer_impl(config_path, resource_dir, dict_path, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_sentence_splitter(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut SentenceSplitterHandle,
) -> i32 {
    create_sentence_splitter_impl(config_path, resource_dir, dict_path, out_handle)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_sentence_splitter_from_tokenizer(
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

    unsafe {
        *out_handle = Box::into_raw(handle);
    }

    OK
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_abi_version() -> i32 {
    SUDACHI_FFI_ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_tokenizer(handle: *mut TokenizerHandle) {
    if handle.is_null() {
        return;
    }

    unsafe {
        drop(Box::from_raw(handle));
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_sentence_splitter(handle: *mut SentenceSplitterHandle) {
    if handle.is_null() {
        return;
    }

    unsafe {
        drop(Box::from_raw(handle));
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_tokenize(
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

    let tokenizer = unsafe { &mut *handle };
    let morpheme_list: sudachi::analysis::mlist::MorphemeList<Arc<JapaneseDictionary>> =
        match tokenizer.tokenizer.tokenize(&text, mode, false) {
            Ok(list) => list,
            Err(err) => {
                return error(ERR_TOKENIZE, format!("tokenization failed: {err}"));
            }
        };

    let mut results = Vec::with_capacity(morpheme_list.len());
    for morpheme in morpheme_list.iter() {
        match morpheme_to_result(&morpheme) {
            Ok(result) => results.push(result),
            Err(code) => {
                free_partial_results(&mut results);
                return code;
            }
        }
    }

    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    let array = Box::new(MorphemeResultArray { items, len });

    unsafe {
        *out_result = Box::into_raw(array);
    }

    OK
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_sentences(
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

    unsafe {
        *out_result = Box::into_raw(array);
    }

    OK
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_result(result: *mut MorphemeResultArray) {
    free_result_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_free_sentence_spans(result: *mut SentenceSpanArray) {
    free_sentence_span_array(result);
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_morpheme_result_layout(out_layout: *mut MorphemeResultLayout) -> i32 {
    clear_last_error();

    if out_layout.is_null() {
        return error(ERR_NULL_POINTER, "out_layout pointer was null");
    }

    unsafe {
        *out_layout = morpheme_result_layout();
    }

    OK
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_sentence_span_layout(out_layout: *mut SentenceSpanLayout) -> i32 {
    clear_last_error();

    if out_layout.is_null() {
        return error(ERR_NULL_POINTER, "out_layout pointer was null");
    }

    unsafe {
        *out_layout = sentence_span_layout();
    }

    OK
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_get_last_error() -> *const c_char {
    last_error_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_status_code_name(code: i32) -> *const c_char {
    status_code_name_ptr(code)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::status_code_name;
    use std::mem::MaybeUninit;

    #[test]
    fn create_sentence_splitter_from_tokenizer_requires_tokenizer_handle() {
        let mut out_handle: *mut SentenceSplitterHandle = ptr::null_mut();
        let status = sudachi_create_sentence_splitter_from_tokenizer(ptr::null(), &mut out_handle);

        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert!(out_handle.is_null());
    }

    #[test]
    fn get_sentence_span_layout_requires_output_pointer() {
        let status = sudachi_get_sentence_span_layout(ptr::null_mut());

        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
    }

    #[test]
    fn get_sentence_span_layout_returns_stable_offsets() {
        let mut layout = MaybeUninit::<SentenceSpanLayout>::uninit();
        let status = sudachi_get_sentence_span_layout(layout.as_mut_ptr());

        assert_eq!(status, OK);
        let layout = unsafe { layout.assume_init() };
        assert_eq!(
            layout.layout_version,
            crate::result::SENTENCE_SPAN_LAYOUT_VERSION
        );
        assert!(layout.span_size > 0);
    }
}
