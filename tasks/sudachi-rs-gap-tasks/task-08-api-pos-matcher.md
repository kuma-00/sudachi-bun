# Task 08: API POS Matcher 導入

## 目的
品詞条件で形態素を絞り込む matcher API を提供する。

## スコープ
- POS パターン型（例: 配列 or DSL）
- `matches(pos)` 判定 API
- MorphemeList フィルタ支援 API

## 実装ステップ
1. matcher 型とビルダを定義
2. POS 階層（品詞大分類〜細分類）の一致ルールを決定
3. Morpheme/MorphemeList へ適用 API を追加
4. `lookup` 結果にも再利用可能にする

## 完了条件
- 完全一致/ワイルドカード相当の両ケースをテスト
- 不正パターンで明確なエラー
- フィルタ後も順序・オフセットが保持される

## 依存
- Task 06, 07
