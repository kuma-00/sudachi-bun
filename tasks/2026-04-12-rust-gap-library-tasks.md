# Rust版との差分: ライブラリ不足機能タスク（2026-04-12）

## タスク一覧
- Task 01: 辞書ビルドAPI（system/user）をTypeScript公開APIへ追加
- Task 02: 低レベル辞書ローダAPI（bytes入力）を公開
- Task 03: StatefulTokenizer相当API（reset/set_mode/set_subset/do_tokenize）を追加
- Task 04: 解析コスト系メタデータ（`totalCost` / `internalCost`）を公開
- Task 05: Morphemeの文字インデックス（codepoint）オフセットを公開
- Task 06: 文境界検出の詳細制御API（limit/eos取得）を追加

## タスク詳細

### Task 01: 辞書ビルドAPI（system/user）をTypeScript公開APIへ追加
- 目的:
  Rust版 `dic::build` 相当の辞書生成機能をライブラリとして利用可能にする。
- 実装内容:
  `sudachi-ffi` に辞書ビルド系エクスポートを追加し、`src/dictionary.ts` もしくは新規 `src/dictionary-build.ts` から呼べるようにする。
- 完了条件:
  TypeScriptから system/user 辞書をビルドでき、ビルド成果物をファイルに書き出せる。

### Task 02: 低レベル辞書ローダAPI（bytes入力）を公開
- 目的:
  ファイルパス依存を減らし、in-memory辞書ロードや検証を可能にする。
- 実装内容:
  辞書バイナリを bytes で渡して読み込む FFI/API を追加し、header/version 種別チェックを返す。
- 完了条件:
  `Uint8Array` 入力から system/user 判定とロード可否が取得できる。

### Task 03: StatefulTokenizer相当API（reset/set_mode/set_subset/do_tokenize）を追加
- 目的:
  1ショットAPIだけでなく、繰り返し解析向けの状態保持APIを提供する。
- 実装内容:
  `StatefulTokenizer` クラスを追加し、`reset`, `setMode`, `setSubset`, `tokenize`（実行フェーズ分離）を提供する。
- 完了条件:
  同一インスタンスで連続入力解析ができ、既存 `Tokenizer` と結果整合が取れる。

### Task 04: 解析コスト系メタデータ（`totalCost` / `internalCost`）を公開
- 目的:
  解析品質評価・デバッグ用途のコスト指標を利用可能にする。
- 実装内容:
  morpheme/list結果にコストフィールドを追加し、FFI結果レイアウトにも反映する。
- 完了条件:
  各 morpheme の `totalCost` と解析全体の `internalCost` を取得できる。

### Task 05: Morphemeの文字インデックス（codepoint）オフセットを公開
- 目的:
  byte offset に加えて文字単位の位置情報を直接利用可能にする。
- 実装内容:
  `Morpheme` に `beginChar` / `endChar` を追加し、FFI結果から正しく復元する。
- 完了条件:
  サロゲートペアを含む文字列でも codepoint ベースで一貫した位置が取得できる。

### Task 06: 文境界検出の詳細制御API（limit/eos取得）を追加
- 目的:
  現状の `split()` のみから、Rust版 `sentence_detector` 相当の制御を可能にする。
- 実装内容:
  `SentenceDetector` ラッパーを追加し、`withLimit` 相当設定と `getEos` 相当APIを提供する。
- 完了条件:
  先頭文のEOS位置取得、limit指定時の挙動、境界未確定時の戻り値仕様をテストで固定できる。

## 実装順序
1. Task 03
2. Task 05
3. Task 04
4. Task 06
5. Task 02
6. Task 01

## 完了条件（全体）
- 既存APIの利用者が移行可能な公開面が揃っている
- 追加APIの単体テストが揃っている
- `bun test` が全件パスする
- `bun run biome:check` がパスする
