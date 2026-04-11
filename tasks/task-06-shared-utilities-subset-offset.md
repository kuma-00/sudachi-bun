# Task 06: 共通ユーティリティ化（subset/offset）

## 目的
重複している `InfoSubset -> bitmask` と UTF-8 byte/char offset 解決を共通化する。

## スコープ
- subset bitmask 変換の共通ヘルパー化
- byte offset index map 生成の共通ヘルパー化
- pretokenizer/sentence-splitter/core の重複除去

## 実装ステップ
1. subset bitmask 共通モジュールを追加
2. byte/char 変換共通モジュールを追加
3. `src/core/operations.ts` と `src/pretokenizer.ts` で共通ヘルパーへ置換
4. `src/sentence-splitter.ts` で共通ヘルパーへ置換

## 完了条件
- subset変換ロジックが単一実装になる
- byte/char境界検証ロジックが単一実装になる
- 不正境界の異常系テストが既存同等で通る

## 依存
- Task 01

