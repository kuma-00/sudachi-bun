use std::mem;
use std::os::raw::c_char;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::ptr;
use std::sync::Arc;

use sudachi::analysis::Mode;
use sudachi::analysis::Tokenize;
use sudachi::analysis::mlist::MorphemeList;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::config::Config;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::sentence_splitter::{SentenceSplitter, SplitSentences};

use crate::convert::{cstr_to_path, cstr_to_string, mode_from_raw};
use crate::error::{
    ERR_CONFIG, ERR_INVALID_INDEX, ERR_MORPHEME_SPLIT, ERR_NULL_POINTER, ERR_SENTENCE_SPLIT,
    ERR_TOKENIZE, OK, clear_last_error, error, last_error_ptr, status_code_name_ptr,
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

const SUDACHI_FFI_ABI_VERSION: i32 = 4;

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
                free_partial_results(&mut results);
                return Err(code);
            }
        }
    }

    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(MorphemeResultArray { items, len }))
}

fn assign_result_array(
    out_result: *mut *mut MorphemeResultArray,
    array: Box<MorphemeResultArray>,
) -> i32 {
    unsafe {
        *out_result = Box::into_raw(array);
    }

    OK
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

    let tokenizer = unsafe { &*handle };
    let morpheme_list = match tokenize_text(tokenizer, &text, mode) {
        Ok(list) => list,
        Err(code) => return code,
    };
    let array = match morpheme_list_to_array(&morpheme_list) {
        Ok(array) => array,
        Err(code) => return code,
    };

    assign_result_array(out_result, array)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_morpheme(
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

    assign_result_array(out_result, array)
}

#[unsafe(no_mangle)]
pub extern "C" fn sudachi_split_morphemes(
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

    assign_result_array(out_result, array)
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
    use std::env;
    use std::ffi::{CStr, CString};
    use std::mem::MaybeUninit;
    use std::path::PathBuf;
    use std::{fs, ptr};

    fn find_sudachi_checkout_dir() -> PathBuf {
        let cargo_home = env::var_os("CARGO_HOME")
            .map(PathBuf::from)
            .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".cargo")))
            .expect("CARGO_HOME or HOME must be set");
        let checkouts_dir = cargo_home.join("git").join("checkouts");

        let checkout_entries = fs::read_dir(&checkouts_dir)
            .unwrap_or_else(|err| panic!("failed to read {}: {err}", checkouts_dir.display()));

        for entry in checkout_entries {
            let Ok(entry) = entry else {
                continue;
            };
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if !name.starts_with("sudachi.rs-") {
                continue;
            }

            let Ok(revisions) = fs::read_dir(&path) else {
                continue;
            };
            for revision in revisions {
                let Ok(revision) = revision else {
                    continue;
                };
                let checkout_dir = revision.path();
                let crate_dir = checkout_dir.join("sudachi");
                let resources = crate_dir.join("tests").join("resources");
                if resources.join("sudachi.json").is_file()
                    && resources.join("system.dic.test").is_file()
                {
                    return checkout_dir;
                }
            }
        }

        panic!(
            "failed to locate sudachi.rs test resources in {}",
            checkouts_dir.display()
        );
    }

    fn with_test_tokenizer<T>(f: impl FnOnce(*mut TokenizerHandle) -> T) -> T {
        let checkout_dir = find_sudachi_checkout_dir();
        let test_resources = checkout_dir.join("sudachi").join("tests").join("resources");
        let resource_root = checkout_dir.join("resources");
        let dict_path = test_resources.join("system.dic.test");
        let config_path = env::temp_dir().join(format!(
            "sudachi-ffi-test-{}.json",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let config_json = format!(
            concat!(
                "{{\n",
                "  \"path\": \"{}\",\n",
                "  \"characterDefinitionFile\": \"char.def\",\n",
                "  \"inputTextPlugin\": [\n",
                "    {{ \"class\": \"com.worksap.nlp.sudachi.DefaultInputTextPlugin\" }}\n",
                "  ],\n",
                "  \"oovProviderPlugin\": [\n",
                "    {{\n",
                "      \"class\": \"com.worksap.nlp.sudachi.SimpleOovPlugin\",\n",
                "      \"oovPOS\": [\"名詞\", \"普通名詞\", \"一般\", \"*\", \"*\", \"*\"],\n",
                "      \"leftId\": 8,\n",
                "      \"rightId\": 8,\n",
                "      \"cost\": 6000\n",
                "    }}\n",
                "  ],\n",
                "  \"pathRewritePlugin\": [\n",
                "    {{ \"class\": \"com.worksap.nlp.sudachi.JoinNumericPlugin\", \"enableNormalize\": true }},\n",
                "    {{\n",
                "      \"class\": \"com.worksap.nlp.sudachi.JoinKatakanaOovPlugin\",\n",
                "      \"oovPOS\": [\"名詞\", \"普通名詞\", \"一般\", \"*\", \"*\", \"*\"],\n",
                "      \"minLength\": 3\n",
                "    }}\n",
                "  ]\n",
                "}}\n"
            ),
            resource_root.to_str().expect("resource root must be UTF-8")
        );
        fs::write(&config_path, config_json).expect("failed to write test sudachi config");

        let config_path_c =
            CString::new(config_path.to_str().expect("config path must be UTF-8")).unwrap();
        let dict_path_c =
            CString::new(dict_path.to_str().expect("dict path must be UTF-8")).unwrap();

        let mut handle = ptr::null_mut();
        let status = sudachi_create_tokenizer(
            config_path_c.as_ptr(),
            ptr::null(),
            dict_path_c.as_ptr(),
            &mut handle,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let output = f(handle);
        sudachi_free_tokenizer(handle);
        let _ = fs::remove_file(config_path);
        output
    }

    fn collect_surfaces_and_offsets(
        result: *mut MorphemeResultArray,
    ) -> Vec<(String, usize, usize)> {
        assert!(!result.is_null());

        unsafe {
            let array = &*result;
            let items = std::slice::from_raw_parts(array.items, array.len);
            items
                .iter()
                .map(|item| {
                    let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                    (surface, item.begin, item.end)
                })
                .collect()
        }
    }

    fn last_error_message() -> String {
        let ptr = sudachi_get_last_error();
        if ptr.is_null() {
            return String::new();
        }

        unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned()
    }

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

    #[test]
    fn split_morpheme_requires_valid_index() {
        with_test_tokenizer(|handle| {
            let text = CString::new("京都東京都").unwrap();
            let mut out_result = ptr::null_mut();
            let status = sudachi_split_morpheme(handle, text.as_ptr(), 2, 99, 0, &mut out_result);

            assert_eq!(status, ERR_INVALID_INDEX);
            assert_eq!(status_code_name(status), "INVALID_INDEX");
            assert!(out_result.is_null());
            assert_eq!(
                last_error_message(),
                "morpheme index 99 out of range for 2 morphemes"
            );
        });
    }

    #[test]
    fn split_morpheme_resplits_one_morpheme_with_original_offsets() {
        with_test_tokenizer(|handle| {
            let text = CString::new("京都東京都").unwrap();
            let mut out_result = ptr::null_mut();
            let status = sudachi_split_morpheme(handle, text.as_ptr(), 2, 1, 0, &mut out_result);

            assert_eq!(status, OK, "{}", last_error_message());
            let values = collect_surfaces_and_offsets(out_result);
            sudachi_free_result(out_result);

            assert_eq!(
                values,
                vec![("東京".to_owned(), 6, 12), ("都".to_owned(), 12, 15)]
            );
        });
    }

    #[test]
    fn split_morphemes_resplits_entire_list() {
        with_test_tokenizer(|handle| {
            let text = CString::new("京都東京都").unwrap();
            let mut out_result = ptr::null_mut();
            let status = sudachi_split_morphemes(handle, text.as_ptr(), 2, 0, &mut out_result);

            assert_eq!(status, OK, "{}", last_error_message());
            let values = collect_surfaces_and_offsets(out_result);
            sudachi_free_result(out_result);

            assert_eq!(
                values,
                vec![
                    ("京都".to_owned(), 0, 6),
                    ("東京".to_owned(), 6, 12),
                    ("都".to_owned(), 12, 15),
                ]
            );
        });
    }

    #[test]
    fn split_morphemes_requires_valid_mode() {
        with_test_tokenizer(|handle| {
            let text = CString::new("京都").unwrap();
            let mut out_result = ptr::null_mut();
            let status = sudachi_split_morphemes(handle, text.as_ptr(), 2, 9, &mut out_result);

            assert_eq!(status, crate::error::ERR_INVALID_MODE);
            assert_eq!(status_code_name(status), "INVALID_MODE");
            assert!(out_result.is_null());
            assert_eq!(last_error_message(), "mode must be 0 (A), 1 (B), or 2 (C)");
        });
    }
}
