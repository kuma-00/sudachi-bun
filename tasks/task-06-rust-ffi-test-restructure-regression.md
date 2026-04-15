# Task 06: Rustテスト再構成と最終回帰確認

## 目的
Rust側の新しい責務分割に合わせてテストを再配置し、リファクタリング後の回帰を防ぐ。

## スコープ
- `sudachi-ffi/src/api/tests.rs` の責務別分割
- 共通fixture/helperの抽出
- Rust/TypeScript双方の最終回帰確認

## 実装ステップ
1. `src/api/tests.rs` を `src/api/tests/mod.rs` へ移す
2. `src/api/tests/common.rs` に辞書fixture、handle helper、result collector、last_error helperを抽出する
3. APIテストを `dictionary.rs`、`tokenize.rs`、`lookup.rs`、`pretokenize.rs`、`pos_matcher.rs`、`sentence.rs`、`layout.rs`、`stateful.rs` に分割する
4. `src/result/tests.rs` は必要に応じて小分けするが、無理に分割しない
5. 最終確認コマンドを全て実行する

## 完了条件
- `bun test` が通る
- `cd sudachi-ffi && cargo test` が通る
- `cd sudachi-ffi && cargo clippy` が通る
- `bunx tsc --noEmit` が通る
- `bun run biome:check` が通る

## 依存
- Task 05
