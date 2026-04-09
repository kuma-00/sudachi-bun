use super::*;
use crate::error::{ERR_INVALID_INDEX, ERR_NULL_POINTER, OK, status_code_name};
use crate::result::{
    LookupResultArray, LookupResultLayout, MorphemeResultArray, PosMatcherResultArray,
    SentenceSpanLayout,
};
use std::env;
use std::ffi::{CStr, CString};
use std::mem::MaybeUninit;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::{fs, ptr};

static TOKENIZER_TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

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

    let config_path_c =
        CString::new(config_path.to_str().expect("config path must be UTF-8")).unwrap();
    let dict_path_c = CString::new(dict_path.to_str().expect("dict path must be UTF-8")).unwrap();

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
                (surface, pos, word_id, item.dictionary_id, item.is_oov, item.pos_id)
            })
            .collect()
    }
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
fn lookup_requires_non_null_pointers() {
    let text = CString::new("東京都").unwrap();
    let mut out_result = ptr::null_mut();

    let status = sudachi_lookup(ptr::null_mut(), text.as_ptr(), &mut out_result);
    assert_eq!(status, ERR_NULL_POINTER);
    assert_eq!(status_code_name(status), "NULL_POINTER");
    assert!(out_result.is_null());

    with_test_tokenizer(|handle| {
        let status = sudachi_lookup(handle, ptr::null(), &mut out_result);
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert!(out_result.is_null());

        let status = sudachi_lookup(handle, text.as_ptr(), ptr::null_mut());
        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
    });
}

#[test]
fn tokenize_requires_output_pointer() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都").unwrap();
        let status = sudachi_tokenize(handle, text.as_ptr(), 0, ptr::null_mut());

        assert_eq!(status, ERR_NULL_POINTER);
        assert_eq!(status_code_name(status), "NULL_POINTER");
        assert_eq!(last_error_message(), "out_result pointer was null");
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
        let status = sudachi_lookup(handle, text.as_ptr(), &mut out_result);

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
fn lookup_returns_empty_array_when_no_complete_match_exists() {
    with_test_tokenizer(|handle| {
        let text = CString::new("東京都に").unwrap();
        let mut out_result = ptr::null_mut();
        let status = sudachi_lookup(handle, text.as_ptr(), &mut out_result);

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
        let status = sudachi_lookup(handle, text.as_ptr(), &mut lookup_result);
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
        let status = sudachi_lookup(handle, text.as_ptr(), &mut lookup_result);
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
