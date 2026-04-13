use std::os::raw::c_char;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use sudachi::analysis::Mode;
use sudachi::analysis::mlist::MorphemeList;
use sudachi::analysis::stateful_tokenizer::StatefulTokenizer;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::config::Config;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;
use sudachi::pos::PosMatcher;
use sudachi::sentence_splitter::{SentenceSplitter, SplitSentences};

use crate::convert::{Projection, cstr_to_path, cstr_to_string, mode_from_raw, projection_from_raw};
use crate::error::{
    ERR_CONFIG, ERR_INTERNAL, ERR_INVALID_INDEX, ERR_LOOKUP, ERR_MORPHEME_SPLIT,
    ERR_PRETOKENIZE, ERR_SENTENCE_SPLIT, ERR_TOKENIZE, OK, clear_last_error, error,
};
use crate::result::{
    LookupResultArray, LookupResultLayout, MorphemeResultArray, MorphemeResultLayout,
    PosMatcherResultArray, PosMatcherResultLayout, PretokenizedResultArray,
    PretokenizedResultLayout, SentenceSpan, SentenceSpanArray, SentenceSpanLayout,
    boxed_slice_into_raw_parts, lookup_morpheme_to_result, lookup_result_layout,
    morpheme_list_to_pretokenized_items, morpheme_result_layout, morpheme_to_result,
    pos_matcher_result_layout, pretokenized_items_to_array, pretokenized_result_layout,
    require_non_null, sentence_span_layout, write_box_ptr, write_ptr, Utf8OffsetMap,
};

#[repr(C)]
pub struct TokenizerHandle {
    pub(crate) dictionary: Arc<JapaneseDictionary>,
    pub(crate) tokenizer: StatelessTokenizer<Arc<JapaneseDictionary>>,
}

#[repr(C)]
pub struct StatefulTokenizerHandle {
    pub(crate) dictionary: Arc<JapaneseDictionary>,
    pub(crate) tokenizer: StatefulTokenizer<Arc<JapaneseDictionary>>,
    pub(crate) include_pos_text: bool,
    pub(crate) input_text: String,
}

#[repr(C)]
pub struct SentenceSplitterHandle {
    pub(crate) dictionary: Arc<JapaneseDictionary>,
}

#[repr(C)]
pub struct PretokenizerHandle {
    pub(crate) core: Arc<dyn PretokenizerCore>,
    pub(crate) debug_enabled: AtomicBool,
    pub(crate) debug_sink: Arc<dyn PretokenizerDebugSink>,
}

#[derive(Clone, Copy)]
pub(crate) struct PretokenizeSettings {
    pub mode: Mode,
    pub split_mode: Mode,
    pub subset: InfoSubset,
    pub include_pos_text: bool,
    pub projection: Projection,
    pub debug: bool,
}

#[derive(Clone, Copy)]
pub(crate) struct PretokenizeDebugRecord {
    pub mode: Mode,
    pub split_mode: Mode,
    pub projection: Projection,
    pub subset_bits: u32,
    pub include_pos_text: bool,
    pub input_bytes: usize,
    pub token_count: usize,
    pub elapsed_us: u128,
}

pub(crate) trait PretokenizerCore: Send + Sync {
    fn pretokenize(
        &self,
        text: &str,
        settings: PretokenizeSettings,
    ) -> Result<Vec<crate::result::PretokenizedItem>, i32>;
}

pub(crate) trait PretokenizerDebugSink: Send + Sync {
    fn emit(&self, record: &PretokenizeDebugRecord);
}

struct SudachiPretokenizer {
    dictionary: Arc<JapaneseDictionary>,
}

struct StderrPretokenizerDebugSink;

const SUDACHI_FFI_ABI_VERSION: i32 = 3;
const FFI_INFO_SUBSET_POS_TEXT_BIT: u32 = 1 << 30;

#[derive(Clone, Copy)]
struct ParsedInfoSubset {
    subset: InfoSubset,
    include_pos_text: bool,
}

pub(crate) fn abi_version() -> i32 {
    SUDACHI_FFI_ABI_VERSION
}

fn mode_name(mode: Mode) -> &'static str {
    match mode {
        Mode::A => "A",
        Mode::B => "B",
        Mode::C => "C",
    }
}

fn projection_name(projection: Projection) -> &'static str {
    match projection {
        Projection::Surface => "surface",
        Projection::Normalized => "normalized",
        Projection::DictionaryForm => "dictionary_form",
        Projection::Reading => "reading",
    }
}

pub(crate) fn format_pretokenize_debug_record(record: &PretokenizeDebugRecord) -> String {
    format!(
        concat!(
            "{{",
            "\"event\":\"pretokenize\",",
            "\"mode\":\"{}\",",
            "\"split_mode\":\"{}\",",
            "\"projection\":\"{}\",",
            "\"subset_bits\":{},",
            "\"include_pos_text\":{},",
            "\"input_bytes\":{},",
            "\"token_count\":{},",
            "\"elapsed_us\":{}",
            "}}"
        ),
        mode_name(record.mode),
        mode_name(record.split_mode),
        projection_name(record.projection),
        record.subset_bits,
        record.include_pos_text,
        record.input_bytes,
        record.token_count,
        record.elapsed_us,
    )
}

impl PretokenizerDebugSink for StderrPretokenizerDebugSink {
    fn emit(&self, record: &PretokenizeDebugRecord) {
        eprintln!("{}", format_pretokenize_debug_record(record));
    }
}

fn default_pretokenizer_debug_sink() -> Arc<dyn PretokenizerDebugSink> {
    Arc::new(StderrPretokenizerDebugSink)
}

fn new_pretokenizer_handle(dictionary: Arc<JapaneseDictionary>) -> Box<PretokenizerHandle> {
    Box::new(PretokenizerHandle {
        core: Arc::new(SudachiPretokenizer { dictionary }),
        debug_enabled: AtomicBool::new(false),
        debug_sink: default_pretokenizer_debug_sink(),
    })
}

fn emit_pretokenizer_debug(handle: &PretokenizerHandle, record: &PretokenizeDebugRecord) {
    if handle.debug_enabled.load(Ordering::Relaxed) {
        handle.debug_sink.emit(record);
    }
}

fn run_ffi(body: impl FnOnce() -> Result<(), i32>) -> i32 {
    clear_last_error();
    match body() {
        Ok(()) => OK,
        Err(code) => code,
    }
}

fn remap_pretokenize_status(code: i32) -> i32 {
    if code == ERR_TOKENIZE {
        ERR_PRETOKENIZE
    } else {
        code
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
    tokenize_text_with_subset(tokenizer, text, mode, InfoSubset::all())
}

fn info_subset_from_bits(bits: u32) -> Result<InfoSubset, i32> {
    Ok(InfoSubset::from_bits(bits)
        .ok_or_else(|| {
            error(
                ERR_INTERNAL,
                format!("invalid info subset bits: {bits:#010x}"),
            )
        })?
        .normalize())
}

fn parsed_info_subset_from_bits(bits: u32) -> Result<ParsedInfoSubset, i32> {
    let subset_bits = bits & !FFI_INFO_SUBSET_POS_TEXT_BIT;
    let subset = info_subset_from_bits(subset_bits)?;
    let include_pos_text =
        bits & FFI_INFO_SUBSET_POS_TEXT_BIT != 0 || subset == InfoSubset::all();
    Ok(ParsedInfoSubset {
        subset,
        include_pos_text,
    })
}

fn tokenize_text_with_subset(
    tokenizer: &TokenizerHandle,
    text: &str,
    mode: Mode,
    subset: InfoSubset,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    let mut analyzer = StatefulTokenizer::create(Arc::clone(&tokenizer.dictionary), false, mode);
    analyzer.set_subset(subset);
    analyzer.reset().push_str(text);
    analyzer.do_tokenize().map_err(|err| {
        error(
            ERR_TOKENIZE,
            format!("tokenization failed for mode {mode:?}: {err}"),
        )
    })?;
    analyzer.into_morpheme_list().map_err(|err| {
        error(
            ERR_TOKENIZE,
            format!("failed to collect tokenization results for mode {mode:?}: {err}"),
        )
    })
}

fn morpheme_list_to_array(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
    text: &str,
    include_pos_text: bool,
    projection: Projection,
) -> Result<Box<MorphemeResultArray>, i32> {
    let mut results = Vec::with_capacity(morpheme_list.len());
    let subset = morpheme_list.subset();
    let offset_map = Utf8OffsetMap::new(text);
    for morpheme in morpheme_list.iter() {
        match morpheme_to_result(&morpheme, subset, include_pos_text, projection, &offset_map) {
            Ok(result) => results.push(result),
            Err(code) => {
                crate::result::free_partial_results(&mut results);
                return Err(code);
            }
        }
    }

    let internal_cost = morpheme_list.get_internal_cost();
    let (items, len) = boxed_slice_into_raw_parts(results.into_boxed_slice());
    Ok(Box::new(MorphemeResultArray {
        items,
        len,
        internal_cost,
    }))
}

fn lookup_text_with_subset(
    tokenizer: &TokenizerHandle,
    text: &str,
    subset: InfoSubset,
) -> Result<MorphemeList<Arc<JapaneseDictionary>>, i32> {
    let mut morpheme_list = MorphemeList::empty(Arc::clone(&tokenizer.dictionary));
    morpheme_list.lookup(text, subset).map_err(|err| {
        error(
            ERR_LOOKUP,
            format!("dictionary lookup failed for surface {text:?}: {err}"),
        )
    })?;
    Ok(morpheme_list)
}

fn lookup_list_to_array(
    morpheme_list: &MorphemeList<Arc<JapaneseDictionary>>,
    subset: InfoSubset,
    include_pos_text: bool,
    projection: Projection,
) -> Result<Box<LookupResultArray>, i32> {
    let mut results = Vec::with_capacity(morpheme_list.len());
    for morpheme in morpheme_list.iter() {
        match lookup_morpheme_to_result(&morpheme, subset, include_pos_text, projection) {
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

impl PretokenizerCore for SudachiPretokenizer {
    fn pretokenize(
        &self,
        text: &str,
        settings: PretokenizeSettings,
    ) -> Result<Vec<crate::result::PretokenizedItem>, i32> {
        let _debug_enabled = settings.debug;
        let tokenizer = TokenizerHandle {
            dictionary: Arc::clone(&self.dictionary),
            tokenizer: StatelessTokenizer::new(Arc::clone(&self.dictionary)),
        };
        let source_list = tokenize_text_with_subset(&tokenizer, text, settings.mode, settings.subset)?;
        let split_list = split_all_morphemes(&source_list, settings.split_mode)?;
        morpheme_list_to_pretokenized_items(
            &split_list,
            text,
            settings.include_pos_text,
            settings.projection,
        )
    }
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

pub(crate) fn create_stateful_tokenizer_from_tokenizer_impl(
    tokenizer_handle: *const TokenizerHandle,
    out_handle: *mut *mut StatefulTokenizerHandle,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(tokenizer_handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let dictionary = Arc::clone(&tokenizer.dictionary);
        let handle = Box::new(StatefulTokenizerHandle {
            tokenizer: StatefulTokenizer::create(Arc::clone(&dictionary), false, Mode::C),
            dictionary,
            include_pos_text: true,
            input_text: String::new(),
        });

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

pub(crate) fn stateful_tokenizer_reset_impl(
    handle: *mut StatefulTokenizerHandle,
    input_utf8: *const c_char,
) -> i32 {
    run_ffi(|| {
        let mut handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { handle.as_mut() };
        let input = if input_utf8.is_null() {
            None
        } else {
            Some(cstr_to_string(input_utf8)?)
        };
        handle.input_text = input.unwrap_or_default();
        let buffer = handle.tokenizer.reset();
        buffer.push_str(&handle.input_text);
        Ok(())
    })
}

pub(crate) fn stateful_tokenizer_set_mode_impl(
    handle: *mut StatefulTokenizerHandle,
    mode: i32,
) -> i32 {
    run_ffi(|| {
        let mut handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { handle.as_mut() };
        handle.tokenizer.set_mode(mode_from_raw(mode)?);
        Ok(())
    })
}

pub(crate) fn stateful_tokenizer_set_subset_impl(
    handle: *mut StatefulTokenizerHandle,
    subset_bits: u32,
) -> i32 {
    run_ffi(|| {
        let mut handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { handle.as_mut() };
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        handle.tokenizer.set_subset(selection.subset);
        handle.include_pos_text = selection.include_pos_text;
        Ok(())
    })
}

pub(crate) fn stateful_tokenizer_do_tokenize_impl(
    handle: *mut StatefulTokenizerHandle,
    projection: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let mut handle = require_non_null(handle, "stateful tokenizer handle was null")?;
        let handle = unsafe { handle.as_mut() };
        let projection = projection_from_raw(projection)?;
        handle.tokenizer.reset().push_str(&handle.input_text);
        handle.tokenizer.do_tokenize().map_err(|err| {
            error(
                ERR_TOKENIZE,
                format!("stateful tokenization failed: {err}"),
            )
        })?;
        let mut morpheme_list = MorphemeList::empty(Arc::clone(&handle.dictionary));
        morpheme_list
            .collect_results(&mut handle.tokenizer)
            .map_err(|err| error(ERR_TOKENIZE, format!("failed to collect stateful results: {err}")))?;
        let array = morpheme_list_to_array(
            &morpheme_list,
            &handle.input_text,
            handle.include_pos_text,
            projection,
        )?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

fn free_handle<T>(handle: *mut T) {
    if handle.is_null() {
        return;
    }

    unsafe {
        drop(Box::from_raw(handle));
    }
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

pub(crate) fn tokenize_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let projection = projection_from_raw(projection)?;
        let morpheme_list = tokenize_text_with_subset(tokenizer, &text, mode, InfoSubset::all())?;
        let array = morpheme_list_to_array(&morpheme_list, &text, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn tokenize_subset_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    mode: i32,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let mode = mode_from_raw(mode)?;
        let projection = projection_from_raw(projection)?;
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        let morpheme_list = tokenize_text_with_subset(tokenizer, &text, mode, selection.subset)?;
        let array = morpheme_list_to_array(
            &morpheme_list,
            &text,
            selection.include_pos_text,
            projection,
        )?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn lookup_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    projection: i32,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let projection = projection_from_raw(projection)?;
        let subset = InfoSubset::all();
        let morpheme_list = lookup_text_with_subset(tokenizer, &text, subset)?;
        let array = lookup_list_to_array(&morpheme_list, subset, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn lookup_subset_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    projection: i32,
    subset_bits: u32,
    out_result: *mut *mut LookupResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let projection = projection_from_raw(projection)?;
        let selection = parsed_info_subset_from_bits(subset_bits)?;
        let morpheme_list = lookup_text_with_subset(tokenizer, &text, selection.subset)?;
        let array = lookup_list_to_array(
            &morpheme_list,
            selection.subset,
            selection.include_pos_text,
            projection,
        )?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
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

pub(crate) fn split_morpheme_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    projection: i32,
    index: usize,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let source_mode = mode_from_raw(source_mode)?;
        let projection = projection_from_raw(projection)?;
        let split_mode = mode_from_raw(split_mode)?;
        let source_list = tokenize_text(tokenizer, &text, source_mode)?;
        let split_list = split_single_morpheme(&source_list, split_mode, index)?;
        let array = morpheme_list_to_array(&split_list, &text, true, projection)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}

pub(crate) fn split_morphemes_impl(
    handle: *mut TokenizerHandle,
    input_utf8: *const c_char,
    source_mode: i32,
    projection: i32,
    split_mode: i32,
    out_result: *mut *mut MorphemeResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let text = cstr_to_string(input_utf8)?;
        let source_mode = mode_from_raw(source_mode)?;
        let projection = projection_from_raw(projection)?;
        let split_mode = mode_from_raw(split_mode)?;
        let source_list = tokenize_text(tokenizer, &text, source_mode)?;
        let split_list = split_all_morphemes(&source_list, split_mode)?;
        let array = morpheme_list_to_array(&split_list, &text, true, projection)?;

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

    #[test]
    fn remaps_tokenize_failures_to_pretokenize_for_pretokenizer_api() {
        assert_eq!(remap_pretokenize_status(ERR_TOKENIZE), ERR_PRETOKENIZE);
    }

    #[test]
    fn preserves_other_error_codes_for_pretokenizer_api() {
        assert_eq!(remap_pretokenize_status(ERR_CONFIG), ERR_CONFIG);
    }
}
