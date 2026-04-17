use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::convert::Projection;
use sudachi::analysis::Mode;
use sudachi::analysis::stateful_tokenizer::StatefulTokenizer;
use sudachi::analysis::stateless_tokenizer::StatelessTokenizer;
use sudachi::dic::dictionary::JapaneseDictionary;
use sudachi::dic::subset::InfoSubset;

use super::{split_all_morphemes, tokenize_text_with_subset};

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

pub(super) fn new_pretokenizer_handle(dictionary: Arc<JapaneseDictionary>) -> Box<PretokenizerHandle> {
    Box::new(PretokenizerHandle {
        core: Arc::new(SudachiPretokenizer { dictionary }),
        debug_enabled: AtomicBool::new(false),
        debug_sink: default_pretokenizer_debug_sink(),
    })
}

pub(super) fn emit_pretokenizer_debug(handle: &PretokenizerHandle, record: &PretokenizeDebugRecord) {
    if handle.debug_enabled.load(Ordering::Relaxed) {
        handle.debug_sink.emit(record);
    }
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
        crate::result::morpheme_list_to_pretokenized_items(
            &split_list,
            text,
            settings.include_pos_text,
            settings.projection,
        )
    }
}
