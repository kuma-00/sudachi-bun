# Task 05: API 文分割 (`SentenceSplitter` 相当)

## 目的
API から文分割機能を独立利用できるようにする。

## スコープ
- 文分割 API の公開
- Tokenizer からの再利用
- 文境界情報（start/end 等）の返却

## 実装ステップ
1. `SentenceSplitter` 相当の公開型を設計
2. 初期化に必要な辞書/設定注入を定義
3. `split(text)` 相当のメソッドを実装
4. CLI `--split-sentences` 側から利用するよう接続

## 完了条件
- API 単体で文分割が呼べる
- 句点・改行・空白の代表ケースをテスト
- CLI 側の文分割とロジック重複がない

## 依存
- Task 03
