# Task 09: API フィールドサブセット (`InfoSubset` 相当)

## 目的
必要なフィールドのみ取得して性能と API 互換性を改善する。

## スコープ
- `InfoSubset` 相当の指定型
- tokenize/lookup 両方での subset 指定
- 未要求フィールドの遅延取得または未設定化

## 実装ステップ
1. subset 指定 enum/bitflags を定義
2. 結果生成で subset を参照して分岐
3. FFI 境界で subset の受け渡し形式を決定
4. 既存呼び出しとの後方互換を維持

## 完了条件
- subset 指定なしで既存挙動と一致
- subset 指定時に未要求項目が計算されないことを確認
- ベンチまたは簡易計測を追加

## 依存
- Task 06, 07
