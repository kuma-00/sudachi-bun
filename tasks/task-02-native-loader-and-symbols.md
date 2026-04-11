# Task 02: Native loader/symbol定義の分離

## 目的
`dlopen` と symbol definition の責務を独立させ、機能別ライブラリロード処理を見通しよくする。

## スコープ
- tokenizer/lookup/pretokenizer/sentence-splitter の symbol 定義分離
- ライブラリパス探索（環境変数/既定探索）の専用化
- loader API の責務明確化

## 実装ステップ
1. symbol 定義を機能別ファイルへ切り出す
2. ライブラリパス解決ロジックを `path-resolver` に分離
3. loader 関数群を `load*Library` ごとに整理し依存方向を単純化
4. 既存テストのモック注入ポイントを新loaderに合わせる

## 完了条件
- symbol 定義と path 解決が別モジュールになる
- `loadNativeLibrary` 系の重複処理が削減される
- loader 単体テストが追加または既存テストで検証可能になる

## 依存
- Task 01

