# Task 02: InfoSubset拡張（split/word structure関連フィールド対応）

## 目的
- Rust版 `InfoSubset` の未対応フィールド `HEAD_WORD_LENGTH` / `SPLIT_A` / `SPLIT_B` / `WORD_STRUCTURE` を扱えるようにする

## 主な変更
- TS `InfoSubsetField` とビットマッピング拡張
- FFIレイヤでの subset 受け渡し・検証更新
- 不正組み合わせ時のエラー定義整理

## 実装ステップ
1. `src/types.ts` の `InfoSubsetField` を拡張する
2. `src/core/info-subset.ts` のビット定義と `ALL_INFO_SUBSET_BITS` を更新する
3. 新フィールドの出力先データ構造（Morpheme/WordInfo等）との対応を定義する
4. subset未指定時・全指定時・部分指定時の動作をテスト追加する
5. README の subset 記述を更新する

## 影響範囲
- `/Users/kuma/Documents/code/sudachi-bun/src/types.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core/info-subset.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core/operations.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core/info-subset.test.ts`
- `/Users/kuma/Documents/code/sudachi-bun/README.md`

## 完了条件
- subset指定で上記フィールドが受理される
- 既存subset挙動との互換が維持される
- 未サポート組み合わせ時のエラーが明確になる
