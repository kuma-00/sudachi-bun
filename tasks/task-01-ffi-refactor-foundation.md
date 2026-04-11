# Task 01: FFIモジュール分割の土台作成

## 目的
`src/native.ts` の再設計に向けて、責務分割後のモジュール境界と型契約を先に固定する。

## スコープ
- 新しい native サブモジュール構成の定義
- 共有型（library interface/layout interface/error interface）抽出
- 既存 import 互換を一時的に維持するエクスポート方針の確立

## 実装ステップ
1. `src/native/` 配下に責務別ファイルを作成
2. `src/native/types.ts` に共有インターフェースを移設
3. 既存 `src/native.ts` は再エクスポート専用ファサードへ縮退
4. 既存利用箇所の import パスを新構成へ段階移行可能な形に調整

## 完了条件
- native 関連の型が `src/native/types.ts` に集約される
- `src/native.ts` が実ロジックを持たず、再エクスポート中心になる
- 既存のビルド/テストが土台変更だけで壊れない

## 依存
- なし
