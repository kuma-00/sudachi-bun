# Task 10: API Surface Projection

## 目的
出力表記（surface/normalized/reading 等）の射影ルールを API として提供する。

## スコープ
- projection 設定型の追加
- tokenize/lookup/再分割結果への適用
- CLI `--all`/通常表示との整合

## 実装ステップ
1. projection モード（例: surface, normalized, dictionary_form）を定義
2. Morpheme 表示値決定ロジックを共通化
3. CLI 出力フォーマッタに projection を接続
4. ドキュメントに各モード差分を追記

## 完了条件
- projection 切替で期待する表示が得られる
- 既定値は後方互換を維持
- 単語単位テストと E2E 1 ケースを追加

## 依存
- Task 02, 09
