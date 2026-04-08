use std::os::raw::c_char;
use std::sync::Arc;

use sudachi::analysis::Tokenize;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::config::Config;
use sudachi::dic::dictionary::JapaneseDictionary;

use crate::convert::{cstr_to_path, cstr_to_string, mode_from_raw};
use crate::error::{
    ERR_CONFIG, ERR_NULL_POINTER, ERR_TOKENIZE, OK, clear_last_error, error, last_error_ptr,
    status_code_name_ptr,
};
use crate::result::{
    MorphemeResult, MorphemeResultArray, MorphemeResultLayout, free_result_array,
    morpheme_result_layout, morpheme_to_result,
};

#[repr(C)]
pub struct TokenizerHandle {
    tokenizer: StatelessTokenizer<Arc<JapaneseDictionary>>,
}

fn free_partial_results(results: &mut [MorphemeResult]) {
    for result in results.iter_mut() {
        result.free_owned_fields();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_create_tokenizer(
    dict_path: *const c_char,
    config_path: *const c_char,
    out_handle: *mut *mut TokenizerHandle,
) -> i32 {
    clear_last_error();

    if out_handle.is_null() {
        return error(ERR_NULL_POINTER, "out_handle pointer was null");
    }

    let dict_path = match cstr_to_path(dict_path) {
        Ok(path) => path,
        Err(code) => return code,
    };
    let config_path = if config_path.is_null() {
        None
    } else {
        match cstr_to_path(config_path) {
            Ok(path) => Some(path),
            Err(code) => return code,
        }
    };

    let cfg = match Config::new(config_path, None, Some(dict_path)) {
        Ok(cfg) => cfg,
        Err(err) => return error(ERR_CONFIG, format!("failed to build sudachi config: {err}")),
    };

    let dictionary = match JapaneseDictionary::from_cfg(&cfg) {
        Ok(dictionary) => dictionary,
        Err(err) => {
            return error(
                ERR_CONFIG,
                format!("failed to load sudachi dictionary: {err}"),
            );
        }
    };

    let tokenizer = StatelessTokenizer::new(Arc::new(dictionary));
    let handle = Box::new(TokenizerHandle { tokenizer });

    unsafe {
        *out_handle = Box::into_raw(handle);
    }

    OK
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

    let mut boxed = results.into_boxed_slice();
    let len = boxed.len();
    let items = if len == 0 {
        std::ptr::null_mut()
    } else {
        let ptr = boxed.as_mut_ptr();
        std::mem::forget(boxed);
        ptr
    };

    let array = Box::new(MorphemeResultArray { items, len });

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
pub extern "C" fn sudachi_get_last_error() -> *const c_char {
    last_error_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_status_code_name(code: i32) -> *const c_char {
    status_code_name_ptr(code)
}
