# Task 03: WordInfo取得API追加

## 目的
- `Morpheme` から Rust版相当の `WordInfo` 系情報（head_word_length, split情報, word_structure等）へアクセス可能にする

## 主な変更
- FFI result レイアウトへ WordInfo 出力を追加
- TS 型定義に `WordInfo` と取得API（`getWordInfo()` など）追加
- morpheme単位取得時の所有権管理とコスト管理を実装

## 実装ステップ
1. Rust側で `WordInfo` 相当構造体を FFI に追加する
2. TS 側レイアウトリーダーを実装し、安全に decode できるようにする
3. `Morpheme` から参照できる API を公開する
4. 既存の `Morpheme` 型と衝突しないよう後方互換方針を整理する
5. 値補完仕様（空文字列時の補完等）を Rust準拠でテスト化する

## 影響範囲
- `/Users/kuma/Documents/code/sudachi-bun/sudachi-ffi/src/result/layout.rs`
- `/Users/kuma/Documents/code/sudachi-bun/sudachi-ffi/src/result/marshal.rs`
- `/Users/kuma/Documents/code/sudachi-bun/src/native/layout/`
- `/Users/kuma/Documents/code/sudachi-bun/src/types.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core/`

## 完了条件
- 解析結果の morpheme から WordInfo 相当情報を取得できる
- head_word_length / split_a / split_b / word_structure を取得できる
- 既存トークナイズAPIが回帰しない
