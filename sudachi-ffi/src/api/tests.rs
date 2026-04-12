use super::*;
use crate::error::{ERR_INVALID_INDEX, ERR_NULL_POINTER, ERR_PRETOKENIZE, OK, status_code_name};
use crate::result::{
    LookupResultArray, LookupResultLayout, MorphemeResult, MorphemeResultArray,
    MorphemeResultLayout,
    PosMatcherResultArray, PretokenizedResultArray, PretokenizedResultLayout, SentenceSpanLayout,
};
use std::env;
use std::ffi::{CStr, CString};
use std::mem::MaybeUninit;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::{fs, ptr};
use sudachi::analysis::Mode;
use sudachi::dic::subset::InfoSubset;

static TOKENIZER_TEST_COUNTER: AtomicU64 = AtomicU64::new(0);
const FFI_INFO_SUBSET_POS_TEXT_BIT: u32 = 1 << 30;

struct TestDictionaryConfig {
    config_path: PathBuf,
    config_path_c: CString,
    dict_path_c: CString,
}

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

fn prepare_test_dictionary_config() -> TestDictionaryConfig {
    let checkout_dir = find_sudachi_checkout_dir();
    let test_resources = checkout_dir.join("sudachi").join("tests").join("resources");
    let resource_root = checkout_dir.join("resources");
    let dict_path = test_resources.join("system.dic.test");
    let config_path = env::temp_dir().join(format!(
        "sudachi-ffi-test-{}-{}.json",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        TOKENIZER_TEST_COUNTER.fetch_add(1, Ordering::Relaxed)
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

    TestDictionaryConfig {
        config_path_c: CString::new(config_path.to_str().expect("config path must be UTF-8"))
            .unwrap(),
        dict_path_c: CString::new(dict_path.to_str().expect("dict path must be UTF-8")).unwrap(),
        config_path,
    }
}

fn with_test_tokenizer<T>(f: impl FnOnce(*mut TokenizerHandle) -> T) -> T {
    let test_config = prepare_test_dictionary_config();

    let mut handle = ptr::null_mut();
    let status = sudachi_create_tokenizer(
        test_config.config_path_c.as_ptr(),
        ptr::null(),
        test_config.dict_path_c.as_ptr(),
        &mut handle,
    );
    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!handle.is_null());

    let output = f(handle);
    sudachi_free_tokenizer(handle);
    let _ = fs::remove_file(test_config.config_path);
    output
}

fn with_test_pretokenizer<T>(f: impl FnOnce(*mut PretokenizerHandle) -> T) -> T {
    let test_config = prepare_test_dictionary_config();

    let mut handle = ptr::null_mut();
    let status = sudachi_create_pretokenizer(
        test_config.config_path_c.as_ptr(),
        ptr::null(),
        test_config.dict_path_c.as_ptr(),
        &mut handle,
    );
    assert_eq!(status, OK, "{}", last_error_message());
    assert!(!handle.is_null());

    let output = f(handle);
    sudachi_free_pretokenizer(handle);
    let _ = fs::remove_file(test_config.config_path);
    output
}

fn collect_surfaces_and_offsets(result: *mut MorphemeResultArray) -> Vec<(String, usize, usize)> {
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

fn collect_surfaces_and_offsets_with_chars(
    result: *mut MorphemeResultArray,
) -> Vec<(String, usize, usize, usize, usize)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                (surface, item.begin, item.end, item.begin_char, item.end_char)
            })
            .collect()
    }
}

fn collect_morpheme_texts(
    result: *mut MorphemeResultArray,
) -> Vec<(String, String, String, String)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                let normalized = CStr::from_ptr(item.normalized).to_str().unwrap().to_owned();
                let dictionary_form =
                    CStr::from_ptr(item.dictionary_form).to_str().unwrap().to_owned();
                let reading = CStr::from_ptr(item.reading).to_str().unwrap().to_owned();
                (surface, normalized, dictionary_form, reading)
            })
            .collect()
    }
}

fn collect_morpheme_result(result: *mut MorphemeResultArray) -> Vec<MorphemeResult> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| MorphemeResult {
                surface: item.surface,
                normalized: item.normalized,
                dictionary_form: item.dictionary_form,
                reading: item.reading,
                pos: item.pos,
                begin: item.begin,
                end: item.end,
                begin_char: item.begin_char,
                end_char: item.end_char,
                word_id: item.word_id,
                pos_id: item.pos_id,
                dictionary_id: item.dictionary_id,
                is_oov: item.is_oov,
                synonym_group_ids: item.synonym_group_ids,
                synonym_group_ids_len: item.synonym_group_ids_len,
            })
            .collect()
    }
}

fn collect_lookup_values(
    result: *mut LookupResultArray,
) -> Vec<(String, String, String, i32, u8, u16)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                let pos = CStr::from_ptr(item.pos).to_str().unwrap().to_owned();
                let word_id = CStr::from_ptr(item.word_id).to_str().unwrap().to_owned();
                (
                    surface,
                    pos,
                    word_id,
                    item.dictionary_id,
                    item.is_oov,
                    item.pos_id,
                )
            })
            .collect()
    }
}

fn collect_pretokenized_values(
    result: *mut PretokenizedResultArray,
) -> Vec<(String, usize, usize, usize, usize)> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items
            .iter()
            .map(|item| {
                let surface = CStr::from_ptr(item.surface).to_str().unwrap().to_owned();
                (surface, item.begin_byte, item.end_byte, item.begin_char, item.end_char)
            })
            .collect()
    }
}

fn utf16_index_for_byte_offset(text: &str, byte_offset: usize) -> usize {
    assert!(byte_offset <= text.len());
    assert!(text.is_char_boundary(byte_offset));

    let mut utf16_index = 0usize;
    for (index, ch) in text.char_indices() {
        if index >= byte_offset {
            break;
        }
        utf16_index += ch.len_utf16();
    }

    utf16_index
}

fn collect_pos_matcher_ids(result: *mut PosMatcherResultArray) -> Vec<u16> {
    assert!(!result.is_null());

    unsafe {
        let array = &*result;
        if array.len == 0 {
            return Vec::new();
        }
        let items = std::slice::from_raw_parts(array.items, array.len);
        items.to_vec()
    }
}

fn last_error_message() -> String {
    let ptr = sudachi_get_last_error();
    if ptr.is_null() {
        return String::new();
    }

    unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned()
}

#[allow(dead_code)]
fn with_test_pretokenizer_from_tokenizer<T>(f: impl FnOnce(*mut PretokenizerHandle) -> T) -> T {
    with_test_tokenizer(|tokenizer_handle| {
        let mut handle = ptr::null_mut();
        let status = sudachi_create_pretokenizer_from_tokenizer(tokenizer_handle, &mut handle);
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let output = f(handle);
        sudachi_free_pretokenizer(handle);
        output
    })
}

fn with_test_stateful_from_tokenizer<T>(
    f: impl FnOnce(*mut StatefulTokenizerHandle) -> T,
) -> T {
    with_test_tokenizer(|tokenizer_handle| {
        let mut handle = ptr::null_mut();
        let status =
            sudachi_create_stateful_tokenizer_from_tokenizer(tokenizer_handle, &mut handle);
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let output = f(handle);
        sudachi_free_stateful_tokenizer(handle);
        output
    })
}

struct CapturingDebugSink {
    lines: Arc<Mutex<Vec<String>>>,
}

impl PretokenizerDebugSink for CapturingDebugSink {
    fn emit(&self, record: &PretokenizeDebugRecord) {
        self.lines
            .lock()
            .unwrap()
            .push(format_pretokenize_debug_record(record));
    }
}

struct PanicDebugSink;

impl PretokenizerDebugSink for PanicDebugSink {
    fn emit(&self, _: &PretokenizeDebugRecord) {
        panic!("pretokenizer debug sink panicked");
    }
}

fn with_capturing_pretokenizer<T>(
    f: impl FnOnce(*mut PretokenizerHandle, Arc<Mutex<Vec<String>>>) -> T,
) -> T {
    with_test_tokenizer(|tokenizer_handle| {
        let mut handle = ptr::null_mut();
        let status = sudachi_create_pretokenizer_from_tokenizer(tokenizer_handle, &mut handle);
        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!handle.is_null());

        let captured = Arc::new(Mutex::new(Vec::new()));
        let sink: Arc<dyn PretokenizerDebugSink> = Arc::new(CapturingDebugSink {
            lines: Arc::clone(&captured),
        });
        unsafe {
            (*handle).debug_sink = sink;
        }

        let output = f(handle, captured);
        sudachi_free_pretokenizer(handle);
        output
    })
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
fn get_abi_version_returns_expected_value() {
    assert_eq!(sudachi_get_abi_version(), 3);
}

#[test]
fn set_pretokenizer_debug_requires_non_null_handle() {
    let status = sudachi_set_pretokenizer_debug(ptr::null(), 1);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn create_pretokenizer_from_tokenizer_requires_tokenizer_handle() {
    let mut out_handle: *mut PretokenizerHandle = ptr::null_mut();
    let status = sudachi_create_pretokenizer_from_tokenizer(ptr::null(), &mut out_handle);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_handle.is_null());
}

#[test]
fn create_stateful_tokenizer_from_tokenizer_requires_tokenizer_handle() {
    let mut out_handle: *mut StatefulTokenizerHandle = ptr::null_mut();
    let status = sudachi_create_stateful_tokenizer_from_tokenizer(ptr::null(), &mut out_handle);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_handle.is_null());
}

#[test]
fn stateful_tokenizer_set_mode_requires_non_null_handle() {
    let status = sudachi_stateful_tokenizer_set_mode(ptr::null_mut(), 0);

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn pretokenize_debug_record_format_is_stable() {
    let record = PretokenizeDebugRecord {
        mode: Mode::B,
        split_mode: Mode::C,
        projection: Projection::Reading,
        subset_bits: 0x1234_5678,
        include_pos_text: true,
        input_bytes: 18,
        token_count: 2,
        elapsed_us: 42,
    };

    assert_eq!(
        format_pretokenize_debug_record(&record),
        "{\"event\":\"pretokenize\",\"mode\":\"B\",\"split_mode\":\"C\",\"projection\":\"reading\",\"subset_bits\":305419896,\"include_pos_text\":true,\"input_bytes\":18,\"token_count\":2,\"elapsed_us\":42}"
    );
}

#[test]
fn pretokenize_debug_record_uses_dictionary_form_projection_name() {
    let record = PretokenizeDebugRecord {
        mode: Mode::A,
        split_mode: Mode::A,
        projection: Projection::DictionaryForm,
        subset_bits: 0,
        include_pos_text: false,
        input_bytes: 3,
        token_count: 1,
        elapsed_us: 1,
    };

    assert!(
        format_pretokenize_debug_record(&record).contains("\"projection\":\"dictionary_form\"")
    );
}

#[test]
fn pretokenizer_debug_setter_controls_emission() {
    with_capturing_pretokenizer(|handle, captured| {
        let text = CString::new("京都東京都").unwrap();

        let status = sudachi_set_pretokenizer_debug(handle, 1);
        assert_eq!(status, OK, "{}", last_error_message());

        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        sudachi_free_pretokenized_result(out_result);

        let lines = captured.lock().unwrap().clone();
        assert_eq!(lines.len(), 1);
        assert!(
            lines[0].starts_with(
                "{\"event\":\"pretokenize\",\"mode\":\"C\",\"split_mode\":\"C\",\"projection\":\"reading\",\"subset_bits\":"
            ),
            "{}",
            lines[0]
        );
        assert!(lines[0].contains("\"token_count\":2"), "{}", lines[0]);

        let status = sudachi_set_pretokenizer_debug(handle, 0);
        assert_eq!(status, OK, "{}", last_error_message());

        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        sudachi_free_pretokenized_result(out_result);

        assert_eq!(captured.lock().unwrap().len(), 1);
    });
}

#[test]
fn pretokenize_debug_panic_leaves_output_pointer_null() {
    with_test_pretokenizer(|handle| {
        let sink: Arc<dyn PretokenizerDebugSink> = Arc::new(PanicDebugSink);
        unsafe {
            (*handle).debug_sink = sink;
            (*handle).debug_enabled.store(true, Ordering::Relaxed);
        }

        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = super::ops::pretokenize_impl(
            handle as *const PretokenizerHandle,
            text.as_ptr(),
            Mode::C as i32,
            Mode::C as i32,
            Projection::Reading as i32,
            0,
            &mut out_result,
        );

        assert_eq!(status, ERR_PRETOKENIZE);
        assert_eq!(status_code_name(status), "PRETOKENIZE");
        assert_eq!(
            last_error_message(),
            "pretokenizer debug sink panicked while emitting debug output"
        );
        assert!(out_result.is_null());
    });
}

#[test]
fn lookup_requires_non_null_pointers() {
    let text = CString::new("東京都").unwrap();
    let mut out_result = ptr::null_mut();

    let status = sudachi_lookup(
        ptr::null_mut(),
        text.as_ptr(),
        Projection::Surface as i32,
        &mut out_result,
    );
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_result.is_null());

    with_test_tokenizer(|handle| {
        let status = sudachi_lookup(
            handle,
            ptr::null(),
            Projection::Surface as i32,
            &mut out_result,
        );
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert!(out_result.is_null());

        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            ptr::null_mut(),
        );
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
    });
}

#[test]
fn get_pretokenized_result_layout_requires_output_pointer() {
    let status = sudachi_get_pretokenized_result_layout(ptr::null_mut());

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn get_morpheme_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<MorphemeResultLayout>::uninit();
    let status = sudachi_get_morpheme_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::MORPHEME_RESULT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.begin_offset > 0);
    assert!(layout.begin_char_offset > 0);
    assert!(layout.end_char_offset > 0);
}

#[test]
fn get_pretokenized_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<PretokenizedResultLayout>::uninit();
    let status = sudachi_get_pretokenized_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::PRETOKENIZED_RESULT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.begin_byte_offset > 0);
    assert!(layout.begin_char_offset > 0);
}

#[test]
fn tokenize_requires_output_pointer() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            0,
            Projection::Surface as i32,
            ptr::null_mut(),
        );

        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert_eq!(last_error_message(), "out_result pointer was null");
    });
}

#[test]
fn tokenize_subset_surface_projection_matches_surface_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();

        let mut compat_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            &mut compat_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let compat_values = collect_surfaces_and_offsets(compat_result);
        sudachi_free_result(compat_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_values = collect_surfaces_and_offsets(subset_result);
        sudachi_free_result(subset_result);

        assert_eq!(subset_values, compat_values);
    });
}

#[test]
fn tokenize_subset_omits_unrequested_expensive_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits(),
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_morpheme_result(out_result);
        sudachi_free_result(out_result);

        assert_eq!(values.len(), 1);
        let item = &values[0];
        assert!(item.surface.is_null());
        assert!(item.normalized.is_null());
        assert!(item.dictionary_form.is_null());
        assert!(item.reading.is_null());
        assert!(item.pos.is_null());
        assert_eq!(item.pos_id, 3);
        assert!(item.synonym_group_ids.is_null());
        assert_eq!(item.synonym_group_ids_len, 0);
        assert_eq!(item.begin, 0);
        assert_eq!(item.end, 9);
    });
}

#[test]
fn tokenize_subset_returns_pos_text_when_requested() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits() | FFI_INFO_SUBSET_POS_TEXT_BIT,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(!item.pos.is_null());
            let pos = CStr::from_ptr(item.pos).to_str().unwrap();
            assert_eq!(pos, "名詞,固有名詞,地名,一般,*,*");
            assert_eq!(item.pos_id, 3);
        }

        sudachi_free_result(out_result);
    });
}

#[test]
fn tokenize_projection_changes_surface_field() {
    with_test_tokenizer(|handle| {
        let text = CString::new("食べた").unwrap();

        let mut surface_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            &mut surface_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let surface_values = collect_morpheme_texts(surface_result);
        sudachi_free_result(surface_result);

        let mut dictionary_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::DictionaryForm as i32,
            &mut dictionary_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let dictionary_values = collect_morpheme_texts(dictionary_result);
        sudachi_free_result(dictionary_result);

        let mut normalized_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Normalized as i32,
            &mut normalized_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let normalized_values = collect_morpheme_texts(normalized_result);
        sudachi_free_result(normalized_result);

        let mut reading_result = ptr::null_mut();
        let status = sudachi_tokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut reading_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let reading_values = collect_morpheme_texts(reading_result);
        sudachi_free_result(reading_result);

        assert_eq!(dictionary_values[0].0, surface_values[0].2);
        assert_eq!(normalized_values[0].0, surface_values[0].1);
        assert_eq!(reading_values[0].0, surface_values[0].3);
    });
}

#[test]
fn tokenize_subset_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_tokenizer(|handle| {
        let text = CString::new("a😀b").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_tokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets_with_chars(out_result);
        sudachi_free_result(out_result);

        assert!(!values.is_empty());
        for (_, begin_byte, end_byte, begin_char, end_char) in values {
            assert_eq!(begin_char, utf16_index_for_byte_offset(text_str, begin_byte));
            assert_eq!(end_char, utf16_index_for_byte_offset(text_str, end_byte));
        }
    });
}

#[test]
fn pretokenize_preserves_byte_and_char_offsets() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_pretokenized_values(out_result);
        sudachi_free_pretokenized_result(out_result);

        assert_eq!(
            values,
            vec![
                ("キョウト".to_owned(), 0, 6, 0, 2),
                ("トウキョウト".to_owned(), 6, 15, 2, 5),
            ]
        );
    });
}

#[test]
fn pretokenize_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("a😀b").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_pretokenized_values(out_result);
        sudachi_free_pretokenized_result(out_result);

        assert!(!values.is_empty());
        for (_, begin_byte, end_byte, begin_char, end_char) in values {
            assert_eq!(begin_char, utf16_index_for_byte_offset(text_str, begin_byte));
            assert_eq!(end_char, utf16_index_for_byte_offset(text_str, end_byte));
        }
    });
}

#[test]
fn pretokenize_subset_matches_default_when_requesting_all_fields() {
    with_test_pretokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();

        let mut default_result = ptr::null_mut();
        let status = sudachi_pretokenize(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            &mut default_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let default_values = collect_pretokenized_values(default_result);
        sudachi_free_pretokenized_result(default_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_pretokenize_subset(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_values = collect_pretokenized_values(subset_result);
        sudachi_free_pretokenized_result(subset_result);

        assert_eq!(subset_values, default_values);
    });
}

#[test]
fn get_lookup_result_layout_requires_output_pointer() {
    let status = sudachi_get_lookup_result_layout(ptr::null_mut());

    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
}

#[test]
fn get_lookup_result_layout_returns_stable_offsets() {
    let mut layout = MaybeUninit::<LookupResultLayout>::uninit();
    let status = sudachi_get_lookup_result_layout(layout.as_mut_ptr());

    assert_eq!(status, OK);
    let layout = unsafe { layout.assume_init() };
    assert_eq!(
        layout.layout_version,
        crate::result::LOOKUP_RESULT_LAYOUT_VERSION
    );
    assert!(layout.result_size > 0);
    assert!(layout.pos_id_offset > 0);
}

#[test]
fn lookup_returns_complete_match_dictionary_entries() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_lookup_values(out_result);
        sudachi_free_lookup_result(out_result);

        assert_eq!(
            values,
            vec![(
                "東京都".to_owned(),
                "名詞,固有名詞,地名,一般,*,*".to_owned(),
                "(0, 6)".to_owned(),
                0,
                0,
                3,
            )]
        );
    });
}

#[test]
fn lookup_subset_surface_projection_matches_surface_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();

        let mut compat_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut compat_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let compat_values = collect_lookup_values(compat_result);
        sudachi_free_lookup_result(compat_result);

        let mut subset_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            InfoSubset::all().bits(),
            &mut subset_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let subset_values = collect_lookup_values(subset_result);
        sudachi_free_lookup_result(subset_result);

        assert_eq!(subset_values, compat_values);
    });
}

#[test]
fn lookup_subset_omits_unrequested_fields() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits(),
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        assert!(!out_result.is_null());

        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(item.surface.is_null());
            assert!(item.pos.is_null());
            assert_eq!(item.pos_id, 3);
            assert!(!item.word_id.is_null());
            assert_eq!(item.dictionary_id, 0);
            assert_eq!(item.is_oov, 0);
        }

        sudachi_free_lookup_result(out_result);
    });
}

#[test]
fn lookup_subset_returns_pos_text_when_requested() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            InfoSubset::POS_ID.bits() | FFI_INFO_SUBSET_POS_TEXT_BIT,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        unsafe {
            let array = &*out_result;
            assert_eq!(array.len, 1);
            let item = &*array.items;
            assert!(item.surface.is_null());
            assert!(!item.pos.is_null());
            let pos = CStr::from_ptr(item.pos).to_str().unwrap();
            let word_id = CStr::from_ptr(item.word_id).to_str().unwrap();
            assert_eq!(pos, "名詞,固有名詞,地名,一般,*,*");
            assert_eq!(word_id, "(0, 6)");
            assert_eq!(item.dictionary_id, 0);
            assert_eq!(item.is_oov, 0);
            assert_eq!(item.pos_id, 3);
        }

        sudachi_free_lookup_result(out_result);
    });
}

#[test]
fn lookup_projection_changes_surface_field() {
    with_test_tokenizer(|handle| {
        let mut out_result = ptr::null_mut();
        let text = CString::new("東京").unwrap();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Reading as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_lookup_values(out_result);
        sudachi_free_lookup_result(out_result);
        assert_eq!(values[0].0, "トウキョウ");
    });
}

#[test]
fn lookup_subset_rejects_invalid_bits() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup_subset(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            1u32 << 31,
            &mut out_result,
        );

        assert_eq!(status, crate::error::ERR_INTERNAL);
        assert_eq!(status_code_name(status), "INTERNAL");
        assert!(out_result.is_null());
        assert_eq!(last_error_message(), "invalid info subset bits: 0x80000000");
    });
}

#[test]
fn lookup_returns_empty_array_when_no_complete_match_exists() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_lookup_values(out_result);
        sudachi_free_lookup_result(out_result);

        assert!(values.is_empty());
    });
}

#[test]
fn compile_pos_matcher_returns_exact_pos_ids() {
    with_test_tokenizer(|handle| {
        let mut lookup_result = ptr::null_mut();
        let text = CString::new("東京都").unwrap();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut lookup_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let lookup_values = collect_lookup_values(lookup_result);
        sudachi_free_lookup_result(lookup_result);

        let exact_pos = &lookup_values[0].1;
        let exact_pattern = format!("[[{}]]", {
            exact_pos
                .split(',')
                .map(|part| format!("{part:?}"))
                .collect::<Vec<_>>()
                .join(",")
        });

        let mut out_result = ptr::null_mut();
        let pattern = CString::new(exact_pattern).unwrap();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);
        assert_eq!(status, OK, "{}", last_error_message());

        let ids = collect_pos_matcher_ids(out_result);
        sudachi_free_pos_matcher_result(out_result);

        assert!(ids.contains(&lookup_values[0].5));
        assert_eq!(ids.len(), 1);
    });
}

#[test]
fn compile_pos_matcher_supports_wildcards() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut lookup_result = ptr::null_mut();
        let status = sudachi_lookup(
            handle,
            text.as_ptr(),
            Projection::Surface as i32,
            &mut lookup_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        sudachi_free_lookup_result(lookup_result);

        let pattern = CString::new(r#"[["名詞", null, null, null, null, null]]"#).unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);
        assert_eq!(status, OK, "{}", last_error_message());

        let ids = collect_pos_matcher_ids(out_result);
        sudachi_free_pos_matcher_result(out_result);

        assert_eq!(ids, vec![3, 4, 7]);
    });
}

#[test]
fn compile_pos_matcher_rejects_invalid_pattern() {
    with_test_tokenizer(|handle| {
        let pattern = CString::new(r#"[["名詞", null, null, null, null, null, null]]"#).unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);

        assert_eq!(status, crate::error::ERR_INTERNAL);
        assert_eq!(status_code_name(status), "INTERNAL");
        assert!(out_result.is_null());
        assert_eq!(
            last_error_message(),
            "invalid POS matcher pattern: patterns must not exceed 6 fields"
        );
    });
}

#[test]
fn compile_pos_matcher_rejects_raw_control_char_in_json_string() {
    with_test_tokenizer(|handle| {
        let pattern = CString::new("[[\"名詞\n\", null, null, null, null, null]]").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_compile_pos_matcher(handle, pattern.as_ptr(), &mut out_result);

        assert_eq!(status, crate::error::ERR_INTERNAL);
        assert_eq!(status_code_name(status), "INTERNAL");
        assert!(out_result.is_null());
        assert_eq!(
            last_error_message(),
            "invalid POS matcher pattern: unescaped control character in string"
        );
    });
}

#[test]
fn split_morpheme_requires_valid_index() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morpheme(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            99,
            0,
            &mut out_result,
        );

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
        let status = sudachi_split_morpheme(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            1,
            0,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets(out_result);
        sudachi_free_result(out_result);

        assert_eq!(
            values,
            vec![("トウキョウ".to_owned(), 6, 12), ("ト".to_owned(), 12, 15)]
        );
    });
}

#[test]
fn split_morphemes_resplits_entire_list() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morphemes(
            handle,
            text.as_ptr(),
            2,
            Projection::Reading as i32,
            0,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets(out_result);
        sudachi_free_result(out_result);

        assert_eq!(
            values,
            vec![
                ("キョウト".to_owned(), 0, 6),
                ("トウキョウ".to_owned(), 6, 12),
                ("ト".to_owned(), 12, 15),
            ]
        );
    });
}

#[test]
fn split_morphemes_requires_valid_mode() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morphemes(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            9,
            &mut out_result,
        );

        assert_eq!(status, crate::error::ERR_INVALID_MODE);
        assert_eq!(status_code_name(status), "INVALID_MODE");
        assert!(out_result.is_null());
        assert_eq!(last_error_message(), "mode must be 0 (A), 1 (B), or 2 (C)");
    });
}

#[test]
fn split_morphemes_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_tokenizer(|handle| {
        let text = CString::new("京都😀東京都").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_split_morphemes(
            handle,
            text.as_ptr(),
            2,
            Projection::Surface as i32,
            0,
            &mut out_result,
        );

        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets_with_chars(out_result);
        sudachi_free_result(out_result);

        assert!(!values.is_empty());
        for (_, begin_byte, end_byte, begin_char, end_char) in values {
            assert_eq!(begin_char, utf16_index_for_byte_offset(text_str, begin_byte));
            assert_eq!(end_char, utf16_index_for_byte_offset(text_str, end_byte));
        }
    });
}

#[test]
fn stateful_tokenizer_reuses_handle_and_respects_mode_changes() {
    with_test_stateful_from_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();
        let mut out_c = ptr::null_mut();
        let status = sudachi_stateful_tokenizer_reset(handle, text.as_ptr());
        assert_eq!(status, OK, "{}", last_error_message());

        let status =
            sudachi_stateful_tokenizer_do_tokenize(handle, Projection::Surface as i32, &mut out_c);
        assert_eq!(status, OK, "{}", last_error_message());
        let c_values = collect_surfaces_and_offsets(out_c);
        sudachi_free_result(out_c);

        let status = sudachi_stateful_tokenizer_set_mode(handle, 0);
        assert_eq!(status, OK, "{}", last_error_message());
        let mut out_a = ptr::null_mut();
        let status =
            sudachi_stateful_tokenizer_do_tokenize(handle, Projection::Surface as i32, &mut out_a);
        assert_eq!(status, OK, "{}", last_error_message());
        let a_values = collect_surfaces_and_offsets(out_a);
        sudachi_free_result(out_a);

        assert!(!c_values.is_empty());
        assert!(!a_values.is_empty());
        assert!(a_values.len() >= c_values.len());
    });
}

#[test]
fn stateful_tokenizer_subset_controls_output_fields() {
    with_test_stateful_from_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_stateful_tokenizer_set_subset(handle, 1 << 0);
        assert_eq!(status, OK, "{}", last_error_message());
        let status = sudachi_stateful_tokenizer_reset(handle, text.as_ptr());
        assert_eq!(status, OK, "{}", last_error_message());
        let status = sudachi_stateful_tokenizer_do_tokenize(
            handle,
            Projection::Surface as i32,
            &mut out_result,
        );
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_morpheme_result(out_result);
        sudachi_free_result(out_result);

        assert!(!values.is_empty());
        assert!(values.iter().all(|item| item.normalized.is_null()));
    });
}

#[test]
fn stateful_tokenizer_uses_utf16_char_offsets_for_surrogate_pairs() {
    with_test_stateful_from_tokenizer(|handle| {
        let text = CString::new("a😀b").unwrap();
        let text_str = text.to_str().unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_stateful_tokenizer_reset(handle, text.as_ptr());
        assert_eq!(status, OK, "{}", last_error_message());
        let status =
            sudachi_stateful_tokenizer_do_tokenize(handle, Projection::Surface as i32, &mut out_result);
        assert_eq!(status, OK, "{}", last_error_message());
        let values = collect_surfaces_and_offsets_with_chars(out_result);
        sudachi_free_result(out_result);

        assert!(!values.is_empty());
        for (_, begin_byte, end_byte, begin_char, end_char) in values {
            assert_eq!(begin_char, utf16_index_for_byte_offset(text_str, begin_byte));
            assert_eq!(end_char, utf16_index_for_byte_offset(text_str, end_byte));
        }
    });
}
