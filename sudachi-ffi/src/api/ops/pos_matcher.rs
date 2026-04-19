use std::os::raw::c_char;

use sudachi::pos::PosMatcher;

use crate::convert::cstr_to_string;
use crate::error::error;
use crate::result::{
    PosMatcherResultArray, PosTupleResultArray, boxed_slice_into_raw_parts, require_non_null,
    strings_to_pos_tuple_result_array, write_box_ptr,
};

use super::handles::TokenizerHandle;
use super::runtime::run_ffi;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum PosPatternItem {
    Wildcard,
    Exact(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PosPattern(pub(super) Vec<PosPatternItem>);

pub(super) fn invalid_pos_pattern(message: impl AsRef<str>) -> i32 {
    error(
        crate::error::ERR_INTERNAL,
        format!("invalid POS matcher pattern: {}", message.as_ref()),
    )
}

pub(super) struct JsonParser<'a> {
    input: &'a str,
    index: usize,
}

impl<'a> JsonParser<'a> {
    pub(super) fn new(input: &'a str) -> Self {
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
                                0x10000
                                    + (((code - 0xD800) as u32) << 10)
                                    + ((low - 0xDC00) as u32)
                            } else {
                                code as u32
                            };
                            let ch = char::from_u32(scalar)
                                .ok_or_else(|| invalid_pos_pattern("invalid unicode scalar value"))?;
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

    pub(super) fn parse_patterns(&mut self) -> Result<Vec<PosPattern>, i32> {
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

pub(super) fn parse_pos_patterns_json(input: &str) -> Result<Vec<PosPattern>, i32> {
    JsonParser::new(input).parse_patterns()
}

pub(super) fn pattern_matches_pos(pattern: &PosPattern, pos: &[String]) -> bool {
    pattern
        .0
        .iter()
        .zip(pos.iter())
        .all(|(pattern_item, pos_item)| match pattern_item {
            PosPatternItem::Wildcard => true,
            PosPatternItem::Exact(expected) => expected == pos_item,
        })
}

pub(super) fn compile_pos_matcher_ids(
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

pub(super) fn compile_pos_matcher_array(
    tokenizer: &TokenizerHandle,
    patterns_json: &str,
) -> Result<Box<PosMatcherResultArray>, i32> {
    let patterns = parse_pos_patterns_json(patterns_json)?;
    let ids = compile_pos_matcher_ids(tokenizer, &patterns)?;
    let (items, len) = boxed_slice_into_raw_parts(ids.into_boxed_slice());
    Ok(Box::new(PosMatcherResultArray { items, len }))
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

pub(super) fn resolve_pos_id_array(
    tokenizer: &TokenizerHandle,
    pos_id: u16,
) -> Result<Box<PosTupleResultArray>, i32> {
    let pos = tokenizer.dictionary.grammar().pos_list.get(pos_id as usize);
    let values = pos.map_or_else(Vec::new, |parts| parts.to_vec());
    strings_to_pos_tuple_result_array(values)
}

pub(crate) fn resolve_pos_id_impl(
    handle: *const TokenizerHandle,
    pos_id: u16,
    out_result: *mut *mut PosTupleResultArray,
) -> i32 {
    run_ffi(|| {
        let tokenizer = require_non_null(handle, "tokenizer handle was null")?;
        let tokenizer = unsafe { tokenizer.as_ref() };
        let array = resolve_pos_id_array(tokenizer, pos_id)?;

        write_box_ptr(out_result, array, "out_result pointer was null")
    })
}
