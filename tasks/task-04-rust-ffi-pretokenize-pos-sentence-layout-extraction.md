# Task 04: pretokenize/POS matcher/sentence/layout処理の分離

## 目的
pretokenizer、POS matcher、sentence splitter、layout getterを独立したモジュールに分け、機能ごとの変更範囲を明確にする。

## スコープ
- pretokenize core/debug処理の分離
- POS matcher JSON parser/compile処理の分離
- sentence split/get_eos処理の分離
- layout getter実装の分離

## 実装ステップ
1. `api/ops/pretokenize.rs` に `PretokenizerCore`、debug sink/record、pretokenize実装を移す
2. `api/ops/pos_matcher.rs` に POS matcher pattern parser と compile処理を移す
3. `api/ops/sentence.rs` に sentence split、get_eos、limit検証、panic-to-error境界を移す
4. `api/ops/layout.rs` に `get_*_layout_impl` 系を移す

## 完了条件
- pretokenize debug、panic handling、POS matcher、sentence splitter、layout offsetテストが通る
- ABI version と各layout version/offsetが変わらない
- `cd sudachi-ffi && cargo test` が通る

## 依存
- Task 03
