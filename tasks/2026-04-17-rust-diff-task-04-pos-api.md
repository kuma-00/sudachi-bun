# Task 04: POS情報API拡張（6要素POSとpos_id逆引き）

## 目的
- 文字列連結POSだけでなく、Rust版同等の6要素POSアクセスと `pos_id -> POS` 解決APIを提供する

## 主な変更
- Dictionary/Tokenizer経由で `posOf(posId)` 相当API追加
- MorphemeのPOS取得を6要素配列で返せるAPI追加
- 既存 `pos: string` を互換目的で維持

## 実装ステップ
1. FFIでgrammar POSリストを参照できる経路を追加する
2. TS側に `PosTuple`（6要素）型を追加する
3. `posOf(posId)` と `morpheme.partOfSpeech()` 相当APIを追加する
4. 不正 `posId` の返り値仕様（`null`）を固定しテスト追加する
5. 既存 `pos` 文字列利用箇所との共存を確認する

## 影響範囲
- `/Users/kuma/Documents/code/sudachi-bun/sudachi-ffi/src/api/ops/`
- `/Users/kuma/Documents/code/sudachi-bun/src/types.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core.test.ts`
- `/Users/kuma/Documents/code/sudachi-bun/README.md`

## 完了条件
- POSを6要素配列で取得できる
- `pos_id` からPOS逆引きできる
- 不正posIdで明確な失敗値（`null`）を返す
