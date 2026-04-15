# Task 02: 共通FFI基盤とdictionary処理の抽出

## 目的
FFI境界の共通処理とdictionary関連処理を分離し、以降の機能別分割を安全に進められる状態にする。

## スコープ
- FFI実行境界、handle解放、null pointer処理の局所化
- dictionary load/inspection/build処理の分離
- dictionary buildの一時ファイル/alias検証/cleanup挙動の維持

## 実装ステップ
1. `api/ops/runtime.rs` に `run_ffi` と `free_handle` を移す
2. `api/ops/handles.rs` に handle型、handle作成、free系処理を移す
3. `api/ops/dictionary.rs` に `load_dictionary`、dictionary inspection、system/user build処理を移す
4. dictionary build用のtemp path、guard、finalize処理を同じモジュール内にまとめる

## 完了条件
- null pointer時のエラーコードとlast_errorの意味が維持されている
- dictionary inspection/build系テストが既存期待値のまま通る
- `cd sudachi-ffi && cargo test` が通る

## 依存
- Task 01
