# Rust FFI保守性リファクタリング: 実装タスク分解（2026-04-14）

## タスク一覧
- Task 01: Rust FFI ops分割の土台作成
- Task 02: 共通FFI基盤とdictionary処理の抽出
- Task 03: tokenization/lookup/split処理の分離
- Task 04: pretokenize/POS matcher/sentence/layout処理の分離
- Task 05: result marshal重複整理
- Task 06: Rustテスト再構成と最終回帰確認

## 実装順序
1. Task 01
2. Task 02
3. Task 03
4. Task 04
5. Task 05
6. Task 06

## 完了条件
- `sudachi-ffi/src/api/ops.rs` の巨大単一責務が解消され、機能ごとのモジュールに分割されている
- exported FFI symbol、ABI version、Cレイアウト、TypeScript側のlayout reader契約が維持されている
- `sudachi-ffi/src/api/tests.rs` が責務別テストファイルへ分割されている
- `bun test`
- `cd sudachi-ffi && cargo test`
- `cd sudachi-ffi && cargo clippy`
- `bunx tsc --noEmit`
- `bun run biome:check`

## 方針
- 今回は保守性優先のため、破壊的なABI/API整理は行わない
- 新しい外部crateは追加しない
- 既存テストの期待値を仕様として扱う
