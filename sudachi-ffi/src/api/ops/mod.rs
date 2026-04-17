use std::os::raw::c_char;
#[cfg(test)]
#[allow(unused_imports)]
use std::fs;
use std::panic::{AssertUnwindSafe, catch_unwind};
#[cfg(test)]
#[allow(unused_imports)]
use std::path::PathBuf;
#[cfg(test)]
#[allow(unused_imports)]
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;

use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::pos::PosMatcher;
use sudachi::sentence_detector::{NonBreakChecker, SentenceDetector};
use sudachi::sentence_splitter::{SentenceSplitter, SplitSentences};

use crate::convert::{cstr_to_string, mode_from_raw, projection_from_raw};
use crate::error::{
    ERR_PRETOKENIZE, ERR_SENTENCE_SPLIT, ERR_TOKENIZE, error,
};
#[cfg(test)]
use crate::error::ERR_CONFIG;
use crate::result::{
    DictionaryBuildReportLayout,
    LookupResultLayout, MorphemeResultLayout, PosMatcherResultArray, PosMatcherResultLayout,
    PretokenizedResultArray,
    PretokenizedResultLayout, SentenceSpan, SentenceSpanArray, SentenceSpanLayout,
    dictionary_build_report_layout,
    boxed_slice_into_raw_parts, lookup_result_layout, morpheme_result_layout,
    pos_matcher_result_layout, pretokenized_items_to_array, pretokenized_result_layout,
    require_non_null, sentence_span_layout, write_box_ptr, write_ptr,
};

mod dictionary;
mod handles;
mod lookup;
mod runtime;
mod split;
mod tokenize;

pub use self::handles::{
    PretokenizerHandle, SentenceSplitterHandle, StatefulTokenizerHandle, TokenizerHandle,
};
pub(crate) use self::handles::PretokenizeDebugRecord;
#[cfg(test)]
pub(crate) use self::handles::{format_pretokenize_debug_record, PretokenizerDebugSink};
use self::handles::{emit_pretokenizer_debug, new_pretokenizer_handle, PretokenizeSettings};
pub(crate) use self::lookup::{lookup_impl, lookup_subset_impl};
pub(crate) use self::split::{split_morpheme_impl, split_morphemes_impl};
pub(crate) use self::tokenize::{
    create_stateful_tokenizer_from_tokenizer_impl, stateful_tokenizer_do_tokenize_impl,
    stateful_tokenizer_reset_impl, stateful_tokenizer_set_mode_impl,
    stateful_tokenizer_set_subset_impl, tokenize_impl, tokenize_subset_impl,
};
use self::tokenize::parsed_info_subset_from_bits;
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

fn remap_pretokenize_status(code: i32) -> i32 {
    if code == ERR_TOKENIZE {
        ERR_PRETOKENIZE
    } else {
        code
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PosPatternItem {
    Wildcard,
    Exact(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PosPattern(Vec<PosPatternItem>);

fn invalid_pos_pattern(message: impl AsRef<str>) -> i32 {
    error(
        crate::error::ERR_INTERNAL,
        format!("invalid POS matcher pattern: {}", message.as_ref()),
    )
}

struct JsonParser<'a> {
    input: &'a str,
    index: usize,
}

impl<'a> JsonParser<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, index: 0 }
    }

    fn eof(&self) -> bool {
        self.index >= self.input.len()
    }

    fn peek_byte(&self) -> Option<u8> {
        self.input.as_bytes().get(self.index).copied()
    }

    fn next_byte(&mut self) -> Option<u8> {
        let byte = self.peek_byte()?;
        self.index += 1;
        Some(byte)
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek_byte(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.index += 1;
        }
    }

    fn expect_byte(&mut self, expected: u8) -> Result<(), i32> {
        match self.next_byte() {
            Some(byte) if byte == expected => Ok(()),
            Some(byte) => Err(invalid_pos_pattern(format!(
                "expected '{}' but found '{}'",
                expected as char, byte as char
            ))),
            None => Err(invalid_pos_pattern("unexpected end of input")),
        }
    }

    fn consume_byte(&mut self, expected: u8) -> bool {
        if self.peek_byte() == Some(expected) {
            self.index += 1;
            true
        } else {
            false
        }
    }

    fn consume_literal(&mut self, literal: &[u8]) -> bool {
        if self
            .input
            .as_bytes()
            .get(self.index..self.index + literal.len())
            == Some(literal)
        {
            self.index += literal.len();
            true
        } else {
            false
        }
    }

    fn parse_hex4(&mut self) -> Result<u16, i32> {
        let mut value = 0u16;
        for _ in 0..4 {
            let byte = self
                .next_byte()
                .ok_or_else(|| invalid_pos_pattern("unexpected end of input in unicode escape"))?;
            value = (value << 4)
                | match byte {
                    b'0'..=b'9' => (byte - b'0') as u16,
                    b'a'..=b'f' => (byte - b'a' + 10) as u16,
                    b'A'..=b'F' => (byte - b'A' + 10) as u16,
                    _ => return Err(invalid_pos_pattern("invalid hex digit in unicode escape")),
                };
        }
        Ok(value)
    }

    fn parse_string(&mut self) -> Result<String, i32> {
        self.expect_byte(b'"')?;
        let mut out = String::new();
        let mut chunk_start = self.index;

        while !self.eof() {
            match self.peek_byte() {
                Some(b'"') => {
                    out.push_str(&self.input[chunk_start..self.index]);
                    self.index += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    out.push_str(&self.input[chunk_start..self.index]);
                    self.index += 1;
                    let escaped = self.next_byte().ok_or_else(|| {
                        invalid_pos_pattern("unexpected end of input in string escape")
                    })?;
                    match escaped {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{0008}'),
                        b'f' => out.push('\u{000c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let code = self.parse_hex4()?;
                            let scalar = if (0xD800..=0xDBFF).contains(&code) {
                                if !(self.consume_byte(b'\\') && self.consume_byte(b'u')) {
                                    return Err(invalid_pos_pattern(
                                        "missing low surrogate after high surrogate",
                                    ));
                                }
                                let low = self.parse_hex4()?;
                                if !(0xDC00..=0xDFFF).contains(&low) {
                                    return Err(invalid_pos_pattern(
                                        "invalid low surrogate in unicode escape",
                                    ));
                                }
                                0x10000 + (((code - 0xD800) as u32) << 10) + ((low - 0xDC00) as u32)
                            } else {
                                code as u32
                            };
                            let ch = char::from_u32(scalar).ok_or_else(|| {
                                invalid_pos_pattern("invalid unicode scalar value")
                            })?;
                            out.push(ch);
                        }
                        _ => return Err(invalid_pos_pattern("unsupported string escape")),
                    }
                    chunk_start = self.index;
                }
                Some(byte) if byte <= 0x1F => {
                    return Err(invalid_pos_pattern("unescaped control character in string"));
                }
                Some(_) => {
                    self.index += 1;
                }
                None => break,
            }
        }

        Err(invalid_pos_pattern("unterminated string"))
    }

    fn parse_pattern_item(&mut self) -> Result<PosPatternItem, i32> {
        self.skip_ws();
        if self.consume_literal(b"null") {
            return Ok(PosPatternItem::Wildcard);
        }

        if matches!(self.peek_byte(), Some(b'"')) {
            return self.parse_string().map(PosPatternItem::Exact);
        }

        Err(invalid_pos_pattern("expected string or null"))
    }

    fn parse_pattern(&mut self) -> Result<PosPattern, i32> {
        self.skip_ws();
        self.expect_byte(b'[')?;
        let mut items = Vec::new();
        self.skip_ws();
        if self.consume_byte(b']') {
            return Ok(PosPattern(items));
        }

        loop {
            items.push(self.parse_pattern_item()?);
            self.skip_ws();
            if self.consume_byte(b',') {
                continue;
            }
            self.expect_byte(b']')?;
            break;
        }

        if items.len() > 6 {
            return Err(invalid_pos_pattern("patterns must not exceed 6 fields"));
        }

        Ok(PosPattern(items))
    }

    fn parse_patterns(&mut self) -> Result<Vec<PosPattern>, i32> {
        self.skip_ws();
        self.expect_byte(b'[')?;
        let mut patterns = Vec::new();
        self.skip_ws();
        if self.consume_byte(b']') {
            return Ok(patterns);
        }

        loop {
            patterns.push(self.parse_pattern()?);
            self.skip_ws();
            if self.consume_byte(b',') {
                continue;
            }
            self.expect_byte(b']')?;
            break;
        }

        self.skip_ws();
        if !self.eof() {
            return Err(invalid_pos_pattern("trailing content after JSON array"));
        }

        Ok(patterns)
    }
}

fn parse_pos_patterns_json(input: &str) -> Result<Vec<PosPattern>, i32> {
    JsonParser::new(input).parse_patterns()
}

fn pattern_matches_pos(pattern: &PosPattern, pos: &[String]) -> bool {
    pattern
        .0
        .iter()
        .zip(pos.iter())
        .all(|(pattern_item, pos_item)| match pattern_item {
            PosPatternItem::Wildcard => true,
            PosPatternItem::Exact(expected) => expected == pos_item,
        })
}

fn compile_pos_matcher_ids(
    tokenizer: &TokenizerHandle,
    patterns: &[PosPattern],
) -> Result<Vec<u16>, i32> {
    let grammar = tokenizer.dictionary.grammar();
    let matched_ids = grammar
        .pos_list
        .iter()
        .enumerate()
        .filter_map(|(pos_id, pos)| {
            patterns
                .iter()
                .any(|pattern| pattern_matches_pos(pattern, pos))
                .then_some(pos_id as u16)
        })
        .collect::<Vec<_>>();

    let matcher = PosMatcher::new(matched_ids);
    let mut ids = matcher.entries().collect::<Vec<_>>();
    ids.sort_unstable();
    Ok(ids)
}

fn compile_pos_matcher_array(
    tokenizer: &TokenizerHandle,
    patterns_json: &str,
) -> Result<Box<PosMatcherResultArray>, i32> {
    let patterns = parse_pos_patterns_json(patterns_json)?;
    let ids = compile_pos_matcher_ids(tokenizer, &patterns)?;
    let (items, len) = boxed_slice_into_raw_parts(ids.into_boxed_slice());
    Ok(Box::new(PosMatcherResultArray { items, len }))
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

pub(crate) fn set_pretokenizer_debug_impl(
    handle: *const PretokenizerHandle,
    enabled: i32,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "pretokenizer handle was null")?;
        let handle = unsafe { handle.as_ref() };
        handle
            .debug_enabled
            .store(enabled != 0, Ordering::Relaxed);
        Ok(())
    })
}

pub(crate) fn pretokenize_impl(
    handle: *const PretokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    split_mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut PretokenizedResultArray,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "pretokenizer handle was null")?;
        let handle = unsafe { handle.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let split_mode = mode_from_raw(split_mode)?;
        let projection = projection_from_raw(projection)?;
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        let debug_enabled = handle.debug_enabled.load(Ordering::Relaxed);
        let started = debug_enabled.then(Instant::now);
        let items = handle.core.pretokenize(
            &text,
            PretokenizeSettings {
                mode,
                split_mode,
                subset: selection.subset,
                include_pos_text: selection.include_pos_text,
                projection,
                debug: debug_enabled,
            },
        )
        .map_err(remap_pretokenize_status)?;
        let token_count = items.len();
        if debug_enabled {
            let debug_record = PretokenizeDebugRecord {
                mode,
                split_mode,
                projection,
                subset_bits,
                include_pos_text: selection.include_pos_text,
                input_bytes: text.len(),
                token_count,
                elapsed_us: started
                    .expect("debug timing not captured")
                    .elapsed()
                    .as_micros(),
            };
            let debug_result = catch_unwind(AssertUnwindSafe(|| {
                emit_pretokenizer_debug(handle, &debug_record);
            }));
            if debug_result.is_err() {
                return Err(error(
                    ERR_PRETOKENIZE,
                    "pretokenizer debug sink panicked while emitting debug output",
                ));
            }
        }
        let array = pretokenized_items_to_array(items)?;
        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn pretokenize_subset_impl(
    handle: *const PretokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut PretokenizedResultArray,
) -> i32 {
    pretokenize_impl(
        handle,
        input_utf8,
        mode,
        mode,
        projection,
        subset_bits,
        out_result,
    )
}

pub(crate) fn compile_pos_matcher_impl(
    handle: *const TokenizerHandle,
    patterns_json: *const c_char,
    out_result: *mut *mut PosMatcherResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let patterns_json = cstr_to_string(patterns_json)?;
        let array = compile_pos_matcher_array(tokenizer, &patterns_json)?;

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

fn sentence_detector_with_limit(limit: i32) -> Result<SentenceDetector, i32> {
    if limit <= 0 {
        return Err(error(
            ERR_SENTENCE_SPLIT,
            "sentence detector limit must be greater than zero",
        ));
    }
    Ok(SentenceDetector::with_limit(limit as usize))
}

fn get_eos_inner(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    detector: SentenceDetector,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    run_ffi(|| {
        let handle = require_non_null(handle, "sentence splitter handle was null")?;
        let _ = require_non_null(out_eos, "out_eos pointer was null")?;
        let _ = require_non_null(out_found, "out_found pointer was null")?;
        let handle = unsafe { handle.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let split_result = catch_unwind(AssertUnwindSafe(|| -> Result<isize, String> {
            let checker = NonBreakChecker::new(handle.dictionary.lexicon());
            detector
                .get_eos(&text, Some(&checker))
                .map_err(|err| err.to_string())
        }));

        let eos = match split_result {
            Ok(Ok(eos)) => eos,
            Ok(Err(err)) => {
                return Err(error(
                    ERR_SENTENCE_SPLIT,
                    format!("sentence eos detection failed: {err}"),
                ));
            }
            Err(_) => {
                return Err(error(
                    ERR_SENTENCE_SPLIT,
                    "sentence eos detection failed due to an internal panic",
                ));
            }
        };

        let (found, eos) = if eos >= 0 {
            (1, eos as usize)
        } else {
            (0, eos.unsigned_abs())
        };

        unsafe {
            *out_eos = eos;
            *out_found = found;
        }

        Ok(())
    })
}

pub(crate) fn get_eos_impl(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    get_eos_inner(handle, input_utf8, SentenceDetector::new(), out_eos, out_found)
}

pub(crate) fn get_eos_with_limit_impl(
    handle: *const SentenceSplitterHandle,
    input_utf8: *const c_char,
    limit: i32,
    out_eos: *mut usize,
    out_found: *mut i32,
) -> i32 {
    let detector = match sentence_detector_with_limit(limit) {
        Ok(detector) => detector,
        Err(status) => return status,
    };
    get_eos_inner(handle, input_utf8, detector, out_eos, out_found)
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

pub(crate) fn get_dictionary_inspection_result_layout_impl(
    out_layout: *mut DictionaryInspectionResultLayout,
) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            dictionary_inspection_result_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_dictionary_build_report_layout_impl(
    out_layout: *mut DictionaryBuildReportLayout,
) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            dictionary_build_report_layout(),
            "out_layout pointer was null",
        )
    })
}

pub(crate) fn get_pretokenized_result_layout_impl(
    out_layout: *mut PretokenizedResultLayout,
) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            pretokenized_result_layout(),
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

pub(crate) fn get_pos_matcher_result_layout_impl(out_layout: *mut PosMatcherResultLayout) -> i32 {
    run_ffi(|| {
        write_ptr(
            out_layout,
            pos_matcher_result_layout(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::fs;

    #[test]
    fn remaps_tokenize_failures_to_pretokenize_for_pretokenizer_api() {
        assert_eq!(remap_pretokenize_status(ERR_TOKENIZE), ERR_PRETOKENIZE);
    }

    #[test]
    fn preserves_other_error_codes_for_pretokenizer_api() {
        assert_eq!(remap_pretokenize_status(ERR_CONFIG), ERR_CONFIG);
    }

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
