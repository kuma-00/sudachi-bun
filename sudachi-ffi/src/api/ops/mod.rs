use std::os::raw::c_char;
#[cfg(test)]
#[allow(unused_imports)]
use std::fs;
#[cfg(test)]
#[allow(unused_imports)]
use std::path::PathBuf;
#[cfg(test)]
#[allow(unused_imports)]
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use crate::result::{require_non_null, write_box_ptr};

mod dictionary;
mod handles;
mod layout;
mod lookup;
mod pos_matcher;
mod pretokenize;
mod runtime;
mod sentence;
mod split;
mod tokenize;

pub use self::handles::{
    PretokenizerHandle, SentenceSplitterHandle, StatefulTokenizerHandle, TokenizerHandle,
};
#[cfg(test)]
pub(crate) use self::handles::PretokenizeDebugRecord;
#[cfg(test)]
pub(crate) use self::handles::{format_pretokenize_debug_record, PretokenizerDebugSink};
use self::handles::new_pretokenizer_handle;
pub(crate) use self::lookup::{lookup_impl, lookup_subset_impl};
pub(crate) use self::pos_matcher::compile_pos_matcher_impl;
pub(crate) use self::pretokenize::{
    pretokenize_impl, pretokenize_subset_impl, set_pretokenizer_debug_impl,
};
pub(crate) use self::sentence::{
    get_eos_impl, get_eos_with_limit_impl, split_sentences_impl,
};
pub(crate) use self::layout::{
    get_dictionary_build_report_layout_impl, get_dictionary_inspection_result_layout_impl,
    get_lookup_result_layout_impl, get_morpheme_result_layout_impl,
    get_pos_matcher_result_layout_impl, get_pretokenized_result_layout_impl,
    get_sentence_span_layout_impl,
};
pub(crate) use self::split::{split_morpheme_impl, split_morphemes_impl};
pub(crate) use self::tokenize::{
    create_stateful_tokenizer_from_tokenizer_impl, stateful_tokenizer_do_tokenize_impl,
    stateful_tokenizer_reset_impl, stateful_tokenizer_set_mode_impl,
    stateful_tokenizer_set_subset_impl, tokenize_impl, tokenize_subset_impl,
};
#[allow(unused_imports)]
pub(crate) use self::dictionary::{
    build_system_dictionary_impl, build_user_dictionary_impl, dictionary_inspection_result_layout,
    finalize_dictionary_output, inspect_dictionary_bytes_impl, load_dictionary,
    write_dictionary_output, write_dictionary_output_with_temp_path, BUILD_OUTPUT_TEMP_COUNTER,
};
#[allow(unused_imports)]
pub use self::dictionary::{
    DictionaryInspectionResult, DictionaryInspectionResultLayout,
};
use self::runtime::{free_handle, run_ffi};

const SUDACHI_FFI_ABI_VERSION: i32 = 3;

pub(crate) fn abi_version() -> i32 {
    SUDACHI_FFI_ABI_VERSION
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

pub(crate) fn create_pretokenizer_impl(
    config_path: *const c_char,
    resource_dir: *const c_char,
    dict_path: *const c_char,
    out_handle: *mut *mut PretokenizerHandle,
) -> i32 {
    run_ffi(|| {
        let dictionary = load_dictionary(config_path, resource_dir, dict_path)?;
        let handle = new_pretokenizer_handle(dictionary);

        write_box_ptr(out_handle, handle, "out_handle pointer was null")
    })
}

pub(crate) fn free_tokenizer_impl(handle: *mut TokenizerHandle) {
    free_handle(handle);
}

pub(crate) fn free_sentence_splitter_impl(handle: *mut SentenceSplitterHandle) {
    free_handle(handle);
}

pub(crate) fn create_pretokenizer_from_tokenizer_impl(
    tokenizer_handle: *const TokenizerHandle,
    out_handle: *mut *mut PretokenizerHandle,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(tokenizer_handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let handle = new_pretokenizer_handle(Arc::clone(&tokenizer.dictionary));

        write_box_ptr(out_handle, handle, "out_handle pointer was null")
    })
}

pub(crate) fn free_pretokenizer_impl(handle: *mut PretokenizerHandle) {
    free_handle(handle);
}

pub(crate) fn free_stateful_tokenizer_impl(handle: *mut StatefulTokenizerHandle) {
    free_handle(handle);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::sync::atomic::Ordering;

    #[test]
    fn write_dictionary_output_preserves_existing_file_on_failure() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sudachi-ffi-build-output-test-{}-{}",
            std::process::id(),
            BUILD_OUTPUT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed),
        ));
        fs::create_dir(&temp_dir).expect("failed to create temp dir");
        let output_path = temp_dir.join("out.dic");
        let original = b"existing dictionary bytes";
        fs::write(&output_path, original).expect("failed to seed output file");

        let result = write_dictionary_output(output_path.as_path(), "system", |_writer| {
            Err("boom".to_string())
        });

        assert!(result.is_err());
        assert_eq!(fs::read(&output_path).expect("failed to read output"), original);
        let entries = fs::read_dir(&temp_dir)
            .expect("failed to list temp dir")
            .count();
        assert_eq!(entries, 1);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn write_dictionary_output_preserves_seeded_temp_file_on_create_new_failure() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sudachi-ffi-build-output-create-new-test-{}-{}",
            std::process::id(),
            BUILD_OUTPUT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed),
        ));
        fs::create_dir(&temp_dir).expect("failed to create temp dir");
        let output_path = temp_dir.join("out.dic");
        let temp_path = temp_dir.join(".out.dic.sudachi-build-existing");
        let original = b"existing temp bytes";
        fs::write(&temp_path, original).expect("failed to seed temp file");

        let result = write_dictionary_output_with_temp_path(
            output_path.as_path(),
            temp_path.clone(),
            "system",
            |_writer| Ok(()),
        );

        assert!(result.is_err());
        assert_eq!(fs::read(&temp_path).expect("failed to read temp file"), original);
        assert!(!output_path.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn write_dictionary_output_cleans_temp_file_on_panic() {
        let temp_dir = std::env::temp_dir().join(format!(
            "sudachi-ffi-build-output-panic-test-{}-{}",
            std::process::id(),
            BUILD_OUTPUT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed),
        ));
        fs::create_dir(&temp_dir).expect("failed to create temp dir");
        let output_path = temp_dir.join("out.dic");
        let original = b"existing dictionary bytes";
        fs::write(&output_path, original).expect("failed to seed output file");

        let result = catch_unwind(AssertUnwindSafe(|| {
            let _ = write_dictionary_output(output_path.as_path(), "system", |_writer| {
                panic!("intentional panic in compile callback")
            });
        }));
        assert!(result.is_err());
        assert_eq!(fs::read(&output_path).expect("failed to read output"), original);
        let entries = fs::read_dir(&temp_dir)
            .expect("failed to list temp dir")
            .count();
        assert_eq!(entries, 1);

        let _ = fs::remove_dir_all(temp_dir);
    }
}
