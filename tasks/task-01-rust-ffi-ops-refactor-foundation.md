# Task 01: Rust FFI ops分割の土台作成

## 目的
`sudachi-ffi/src/api/ops.rs` の分割に先立ち、公開される内部API名を維持したままモジュール化できる土台を作る。

## スコープ
- `api::ops` のファサード化
- 既存 `exports.rs` から呼ばれる `*_impl` 関数名の維持
- handle型とlayout型の再エクスポート方針の固定

## 実装ステップ
1. `sudachi-ffi/src/api/ops.rs` を `sudachi-ffi/src/api/ops/mod.rs` へ移す
2. `mod.rs` を一時的なファサードとして構成する
3. `exports.rs` と `api.rs` の参照が変わらないことを確認する
4. この段階ではロジックの移動以外の挙動変更を入れない

## 完了条件
- `api::ops::*` の既存参照がコンパイルできる
- exported FFI symbol に変更がない
- `cd sudachi-ffi && cargo test` が通る

## 依存
- なし
