# Task 04: Nativeエラー変換層の分離

## 目的
native status/error の取得・正規化・`SudachiError` 変換を一箇所に集約する。

## スコープ
- `readNativeError` / `readNativeStatusCodeName` / `createNativeSudachiError` の専用化
- `NativeErrorLibrary` 契約の明確化
- 異常時フォールバック規約の固定化

## 実装ステップ
1. error mapper モジュールを作成し既存3関数を移設
2. 呼び出し側（session/operations/pretokenizer/sentence-splitter）を新APIへ置換
3. status code 正規化の対応表を集中管理
4. 例外メッセージフォーマットのテストを維持

## 完了条件
- nativeエラー変換ロジックが単一モジュール化される
- 呼び出し側での status 判定重複がない
- エラー名変換と fallback の挙動が既存テストで維持される

## 依存
- Task 01
- Task 02

