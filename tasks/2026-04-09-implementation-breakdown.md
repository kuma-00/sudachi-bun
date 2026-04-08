# 実装タスク分解（PLAN.md ベース）

## 1. Rust FFI コア（Worker 1）
- `sudachi-ffi` を `cdylib` 化
- C ABI 実装
  - `sudachi_create_tokenizer`
  - `sudachi_free_tokenizer`
  - `sudachi_tokenize`
  - `sudachi_free_result`
  - `sudachi_get_last_error`
- `TokenizerHandle` を不透明ポインタとして管理
- エラー処理を `戻り値コード + last_error` で統一
- `MorphemeResultArray` / `MorphemeResult` のメモリ確保と一括解放

## 2. Bun TypeScript ラッパー（Worker 2）
- `bun:ffi` で Rust C ABI をロード
- `Tokenizer` クラス実装
  - `constructor/init`
  - `tokenize(text, mode)`
  - `close()`
- FFI の結果構造体を TS オブジェクト配列へ変換
- `detail_json` の parse とフォールバック
- モード `A | B | C` のマッピング

## 3. 辞書セットアップと運用導線（Worker 3）
- `bun run setup:dict` を追加
- `scripts/setup-dict.ts` 実装
  - `--type`
  - `--version`
  - `--out`
  - `--url`
- ダウンロード/展開失敗時の明確なエラーメッセージ
- README にビルド・セットアップ・実行手順を追記

## 4. 統合と検証（Main）
- Rust/TS 間 ABI 整合の最終調整
- 実行確認
  - `cargo test`（sudachi-ffi）
  - `cargo build --release`（sudachi-ffi）
  - `bunx tsc --noEmit`
  - `bun run index.ts`
  - `bun run setup:dict -- --help`
