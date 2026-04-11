# Task 07: 公開API全面再設計 + CLI接続更新

## 目的
公開APIを `createSudachi(options)` 中心へ再設計し、操作APIをオブジェクト引数へ統一する。

## スコープ
- 新公開エントリポイント導入（tokenizer/splitter/pretokenizer 複合）
- Tokenizer API のシグネチャ全面更新
- `index.ts` の export 構成再編
- CLI tokenize 実装を新API経由へ移行

## 実装ステップ
1. `createSudachi` と戻り値契約 `{ tokenizer, splitter, pretokenizer, close }` を実装
2. Tokenizer 各メソッドをオブジェクト引数形式へ変更
3. package root export を新API中心へ更新
4. CLI実行層（`src/cli/execute.ts`）を新API呼び出しへ置換
5. 旧API（`createTokenizer` など）を削除

## 完了条件
- 新APIのみが公開される
- CLI tokenize の出力とデバッグ挙動が既存同等
- 型定義が新シグネチャへ一貫して更新される

## 依存
- Task 05
- Task 06

