# Rust版差分（ライブラリ機能不足）: 実装タスク分解（2026-04-17）

## タスク一覧
- Task 01: SurfaceProjection拡張（複合projection対応）
  - 詳細: `tasks/2026-04-17-rust-diff-task-01-surface-projection.md`
- Task 02: InfoSubset拡張（split/word structure関連フィールド対応）
  - 詳細: `tasks/2026-04-17-rust-diff-task-02-info-subset.md`
- Task 03: WordInfo取得API追加
  - 詳細: `tasks/2026-04-17-rust-diff-task-03-word-info.md`
- Task 04: POS情報API拡張（6要素POSとpos_id逆引き）
  - 詳細: `tasks/2026-04-17-rust-diff-task-04-pos-api.md`
- Task 05: Dictionary中心APIの導入
  - 詳細: `tasks/2026-04-17-rust-diff-task-05-dictionary-api.md`
- Task 06: HF pretokenizerカスタムハンドラ対応
  - 詳細: `tasks/2026-04-17-rust-diff-task-06-hf-handler.md`

## 実装順序
1. Task 01
2. Task 02
3. Task 03
4. Task 04
5. Task 05
6. Task 06

## 完了条件（全体）
- 上記6タスクの要件を満たし、Rust版との差分として挙げた不足機能をライブラリAPIでカバーしている
- `bun test`
- `cd sudachi-ffi && cargo test`
- `cd sudachi-ffi && cargo clippy`
- `bunx tsc --noEmit`
- `bun run biome:check`

## 方針
- 破壊的変更を許容して実装速度を優先する
- ただし利用者移行コストが高い箇所は段階導入（併存API）を検討する
- CLI差分は対象外とし、ライブラリAPIの不足解消を優先する
