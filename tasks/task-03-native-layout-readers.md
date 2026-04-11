# Task 03: レイアウト読取/検証層の分離

## 目的
FFIレイアウト読取と検証責務を独立させ、型変換ロジックの保守性と検証性を上げる。

## スコープ
- `read*ResultLayout` 系の分離
- 共通検証ロジック（layout version / array layout kind / size）の共通化
- 機能別ビルダー（morpheme/lookup/pretokenized/pos/sentence）整理

## 実装ステップ
1. 共通 `readResultLayout` と `validateArrayLayout` を専用モジュール化
2. 各 `read*ResultLayout` を機能別に移設
3. 既存呼び出し箇所を新モジュール参照へ置換
4. mismatch 異常系のテストを分割後モジュールで維持

## 完了条件
- レイアウト読取が `src/native/layout/*` 配下に分離される
- 型ビルド処理とバリデーション処理の依存が単方向になる
- `native.test.ts` のレイアウト系ケースが継続して通る

## 依存
- Task 01
- Task 02

