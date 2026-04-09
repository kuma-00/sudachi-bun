# Task 06: API 形態素再分割 (`Morpheme.split` / `MorphemeList.split_into`)

## 目的
既存解析結果を A/B/C 等の粒度へ再分割できる API を提供する。

## スコープ
- `Morpheme.split(mode)` 相当
- `MorphemeList.split_into(mode)` 相当
- 不正モード/境界ケースのエラー処理

## 実装ステップ
1. Morpheme 型に再分割 API を追加
2. MorphemeList 一括再分割 API を追加
3. 元トークンとのオフセット整合性を担保
4. 既存 tokenize(mode) との差分仕様をドキュメント化

## 完了条件
- A/B/C の再分割結果が再解析と矛盾しない（許容差を定義）
- 空配列・単一要素でクラッシュしない
- API テストを追加

## 依存
- Task 05
