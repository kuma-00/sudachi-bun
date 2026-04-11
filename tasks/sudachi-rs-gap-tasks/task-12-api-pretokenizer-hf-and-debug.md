# Task 12: HuggingFace Pretokenizer 連携 + Debug 切替（API/FFI）

## 目的
HuggingFace tokenizers と接続し、Pretokenizer のデバッグ切替を API/FFI で有効化する。

## スコープ
- HuggingFace tokenizers 連携アダプタ
- API での `debug` オプション公開
- FFI 境界での debug フラグ受け渡し
- デバッグ出力のフォーマット固定

## 実装ステップ
1. HF tokenizers 向けアダプタを実装
2. Task 11 のインターフェースに接続
3. `debug` フラグを API -> FFI -> Rust 実装へ伝搬
4. debug ON/OFF のログ項目・出力先を定義

## 完了条件
- HF tokenizers 経由で tokenize 可能
- debug ON/OFF で差分が確認できる
- 通常実行時（debug OFF）の性能劣化が許容範囲
- FFI 経由の結合テストを追加

## 依存
- Task 03, 11
