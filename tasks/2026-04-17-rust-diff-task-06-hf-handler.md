# Task 06: HF pretokenizerカスタムハンドラ対応

## 目的
- Rust/Pythonの `pre_tokenizer(handler=...)` 相当として、Sudachi結果を任意変換できるハンドラ拡張を行う

## 主な変更
- `createHuggingFacePretokenizer` に handler 引数追加
- handler 利用時の必須 subset 自動解決
- handler 未指定時は現行挙動を維持

## 実装ステップ
1. HFアダプタAPIに `handler` シグネチャを追加する
2. handler実行時に必要な morpheme 情報の subset を自動で補完する
3. 例外時のエラーメッセージを利用者向けに整備する
4. `pre_tokenize_str` / `pre_tokenize` 双方で同じ変換規約を適用する
5. READMEに handler 利用例を追加する

## 影響範囲
- `/Users/kuma/Documents/code/sudachi-bun/src/pretokenizer-hf.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/pretokenizer.ts`
- `/Users/kuma/Documents/code/sudachi-bun/index.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/pretokenizer-hf.test.ts`
- `/Users/kuma/Documents/code/sudachi-bun/README.md`

## 完了条件
- handlerでトークン列変換を差し込める
- handler未指定時の挙動が現在と一致する
- HF連携テストが追加され回帰しない
