# Task 01: SurfaceProjection拡張（複合projection対応）

## 目的
- Rust版の `dictionary_and_surface` / `normalized_and_surface` / `normalized_nouns` を Bun APIで指定可能にする

## 主な変更
- `SurfaceProjection` 型の拡張
- FFI `projection_from_raw` と TS 側 enum マッピング更新
- morpheme / lookup / pretokenize の投影結果一貫化

## 実装ステップ
1. `src/types.ts` の `SURFACE_PROJECTIONS` / `SurfaceProjection` を拡張する
2. `sudachi-ffi/src/convert.rs` の `Projection` enum と `projection_from_raw` を拡張する
3. TS 側の `PROJECTION_TO_NATIVE` マップ（tokenizer/pretokenizer/stateful）を更新する
4. tokenize / lookup / split / pretokenize の各経路で新projection値が透過的に動作することを確認する
5. APIドキュメント（README）を更新する

## 影響範囲
- `/Users/kuma/Documents/code/sudachi-bun/src/types.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/pretokenizer.ts`
- `/Users/kuma/Documents/code/sudachi-bun/sudachi-ffi/src/convert.rs`
- `/Users/kuma/Documents/code/sudachi-bun/README.md`

## 完了条件
- TypeScript APIから3種の複合projectionを指定できる
- tokenize / lookup / split / pretokenize で期待どおり投影される
- 既存projectionの挙動が回帰しない
