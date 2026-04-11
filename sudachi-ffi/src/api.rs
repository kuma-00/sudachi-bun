mod exports;
mod ops;
#[cfg(test)]
mod tests;

#[cfg(test)]
pub(crate) use crate::convert::Projection;

pub use exports::{
    sudachi_compile_pos_matcher, sudachi_create_pretokenizer,
    sudachi_create_pretokenizer_from_tokenizer, sudachi_create_sentence_splitter,
    sudachi_create_sentence_splitter_from_tokenizer, sudachi_create_tokenizer,
    sudachi_free_lookup_result, sudachi_free_pos_matcher_result, sudachi_free_pretokenized_result,
    sudachi_free_result, sudachi_free_sentence_spans, sudachi_free_sentence_splitter,
    sudachi_free_tokenizer, sudachi_free_pretokenizer, sudachi_get_abi_version,
    sudachi_get_last_error, sudachi_get_lookup_result_layout, sudachi_get_morpheme_result_layout,
    sudachi_get_pos_matcher_result_layout, sudachi_get_pretokenized_result_layout,
    sudachi_get_sentence_span_layout, sudachi_lookup, sudachi_lookup_subset, sudachi_pretokenize,
    sudachi_pretokenize_subset,
    sudachi_split_morpheme, sudachi_split_morphemes, sudachi_split_sentences,
    sudachi_status_code_name, sudachi_tokenize, sudachi_tokenize_subset,
};

pub use ops::{PretokenizerHandle, SentenceSplitterHandle, TokenizerHandle};
