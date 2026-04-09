# Task 03: CLI 実行時オプション (`--split-sentences` / `--debug` / `--resource_dir`)

## 目的
解析の挙動を切り替える実行時オプションを整備する。

## スコープ
- `--split-sentences`（入力の文単位処理）
- `--debug`（デバッグ情報出力/内部フラグ ON）
- `--resource_dir <path>`（辞書/設定探索ディレクトリ指定）

## 実装ステップ
1. オプション定義を追加
2. Tokenizer 初期化パスに `resource_dir` を通す
3. 文分割フラグを実行ループに反映
4. `debug` を API/FFI レイヤに受け渡せる構造に変更

## 完了条件
- 3 オプションが単体で機能
- `resource_dir` 不正時に明確なエラー
- `debug` で通常出力が壊れず、追加情報のみ増える

## 依存
- Task 01
