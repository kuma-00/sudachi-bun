# Task 05: Tokenizer Gateway + Session責務再編

## 目的
`core/operations` から低レベルFFI詳細を切り離し、Gateway経由の実行に統一する。

## スコープ
- tokenizer 実行系（tokenize/lookup/split/splitInto/compilePosMatcher）の Gateway 化
- `TokenizerSessionManager` の責務をハンドル管理・遅延ロードへ限定
- `core/operations.ts` のオーケストレーション専念化

## 実装ステップ
1. tokenizer gateway インターフェースを新設
2. `core/session.ts` が gateway 実装を返す構造へ変更
3. `core/operations.ts` のネイティブ直接呼び出しを排除
4. morpheme state tracker との境界を明文化して結合テストを維持

## 完了条件
- `core/operations.ts` が FFIシンボルやレイアウト型へ直接依存しない
- session は lifecycle 管理中心となり decode 判断を持たない
- split/splitInto の既存挙動（owned/fallback）が維持される

## 依存
- Task 03
- Task 04

