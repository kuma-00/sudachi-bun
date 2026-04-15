# Task 03: tokenization/lookup/split処理の分離

## 目的
tokenize、stateful tokenizer、lookup、morpheme splitの処理を責務別に分離し、`ops` の中核ロジックを読みやすくする。

## スコープ
- tokenization処理の分離
- stateful tokenizer操作の分離
- lookup処理の分離
- morpheme split処理の分離

## 実装ステップ
1. `api/ops/tokenize.rs` に `tokenize_impl`、`tokenize_subset_impl`、stateful tokenizer操作、tokenize共通helperを移す
2. `api/ops/lookup.rs` に `lookup_impl`、`lookup_subset_impl`、lookup共通helperを移す
3. `api/ops/split.rs` に `split_morpheme_impl`、`split_morphemes_impl`、split共通helperを移す
4. `InfoSubset` と projection/mode変換の扱いを既存仕様のまま維持する

## 完了条件
- tokenize/lookup/split/stateful tokenizerの既存テストが通る
- UTF-16 char offset、subset field omission、projection挙動が維持されている
- `cd sudachi-ffi && cargo test` が通る

## 依存
- Task 02
