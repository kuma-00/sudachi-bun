# Sudachi.rs を Bun FFI で TypeScript 利用可能にする計画

## Summary
- 新規プロジェクトとして「Rust FFI ブリッジ + TypeScript ラッパー」を作成し、`sudachi.rs` は Git 依存（固定 rev）で取り込む。
- Bun からは C ABI 経由で呼び出し、`createTokenizer`/`freeTokenizer`/`tokenize` を中心とした中間 API を提供する。
- 対応環境は v1 で `macOS + Linux`。配布は「ローカルビルド前提」。
- 辞書は「自動ダウンロード連携」を組み込み、初回セットアップを Bun 側コマンドで実行可能にする。

## Key Changes (Implementation)
- Rust 側（`cdylib`）を作成:
  - `extern "C"` で公開: `sudachi_create_tokenizer`, `sudachi_free_tokenizer`, `sudachi_tokenize`, `sudachi_free_result`, `sudachi_get_last_error`
  - エラーは戻り値コード + `last_error` 方式で統一。
  - Tokenizer は不透明ハンドル（`*mut TokenizerHandle`）で管理。
- 返却データ ABI:
  - `tokenize` は `MorphemeResultArray*`（ポインタ配列）を返す方式。
  - 各要素は「固定コア + 詳細JSON拡張」:
    - コア: `surface, normalized, dictionary_form, reading, pos, begin, end, word_id`
    - 追加メタ: `pos_id, dictionary_id, is_oov, synonym_group_ids`
    - 拡張: `detail_json`（20+項目要求を将来互換で満たす）
  - Rust 側で確保したメモリは `sudachi_free_result` で一括解放。
- TypeScript 側（Bun FFI）:
  - `bun:ffi` でシンボル定義し、TS クラス `Tokenizer` を実装（`init/close/tokenize`）。
  - `tokenize` は FFI戻り値を TS オブジェクト配列へ変換し、`detail_json` を parse して詳細情報を提供。
  - 辞書自動DLコマンド（例: `bun run setup:dict`）を用意し、取得先バージョン/種別をオプション化。
- ビルド/運用:
  - `cargo build --release` で `.dylib/.so` を生成し、Bun ラッパーがロードするパス規約を固定。
  - Git 依存の `sudachi` は `rev` 固定で再現性を確保。更新時は明示的 rev 更新。
  - 依存追加は `cd sudachi-ffi && cargo add sudachi --git https://github.com/WorksApplications/sudachi.rs.git --rev <commit-sha>` を使って `Cargo.toml` に固定化する。

## Public APIs / Interfaces
- Rust C ABI:
  - `sudachi_create_tokenizer(dict_path, config_path, out_handle) -> int`
  - `sudachi_tokenize(handle, input_utf8, mode, out_result) -> int`
  - `sudachi_free_result(result_ptr) -> void`
  - `sudachi_free_tokenizer(handle) -> void`
  - `sudachi_get_last_error() -> *const c_char`
- TypeScript:
  - `new Tokenizer({ dictPath, configPath? })`
  - `tokenize(text: string, mode: "A" | "B" | "C"): Morpheme[]`
  - `close(): void`
  - `setupDictionary({ type, version? }): Promise<void>`（CLI/スクリプト経由）

## Test Plan
- Rust 単体:
  - 有効辞書で `create -> tokenize -> free` が成功すること。
  - 無効辞書/無効UTF-8/NULL入力でエラーコード + `last_error` が正しく返ること。
  - `tokenize/free_result` を多数回繰り返してリークしないこと。
- TS 結合:
  - Bun から `.dylib/.so` をロードし、モード `A/B/C` で結果件数・境界（`begin/end`）が取得できること。
  - `detail_json` の parse 失敗時フォールバック動作。
  - macOS/Linux の CI マトリクスでビルドと最小呼び出し確認。
- 受け入れ:
  - 初回は `bun run setup:dict` 実行後、サンプル文字列を TS から tokenize できること。

## Assumptions
- 現在の作業ディレクトリは新規プロジェクトのため、実装時にそのまま作業する。
- `sudachi.rs` 本体へ直接パッチせず、外側に FFI ブリッジ層を作る。`sudachi-ffi`ディレクトリがあるので、そこに実装する。
- `detail_json` の具体フィールド定義は `sudachi` 取得可能情報を網羅しつつ、v1 で後方互換を優先する。
