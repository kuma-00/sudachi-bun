# Task 11: API Pretokenizer 基盤

## 目的
外部トークナイザ連携前に、Pretokenizer の共通インターフェースを整備する。

## スコープ
- Pretokenizer インターフェース定義
- Tokenizer 出力との相互変換（オフセット保持）
- 設定注入（split mode / subset / projection 連携）

## 実装ステップ
1. Pretokenizer trait/interface を追加
2. 既存 tokenize 結果を pretokenized 形式へ変換
3. オフセット正規化（UTF-8/文字インデックス）を仕様化
4. 連携先依存なしで動く最小実装を用意

## 完了条件
- ダミー pretokenizer 実装で結合テストが通る
- オフセット不整合時のエラーが明確
- HuggingFace 連携を差し込める拡張点がある

## 依存
- Task 09, 10
