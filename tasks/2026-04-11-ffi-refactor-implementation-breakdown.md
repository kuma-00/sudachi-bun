# FFI境界再設計: 実装タスク分解（2026-04-11）

## タスク一覧
- Task 01: FFIモジュール分割の土台作成
- Task 02: Native loader/symbol定義の分離
- Task 03: レイアウト読取/検証層の分離
- Task 04: Nativeエラー変換層の分離
- Task 05: Tokenizer Gateway + Session責務再編
- Task 06: 共通ユーティリティ化（subset/offset）
- Task 07: 公開API全面再設計 + CLI接続更新
- Task 08: テスト再構成と回帰検証

## 実装順序
1. Task 01
2. Task 02, 03, 04
3. Task 05, 06
4. Task 07
5. Task 08

## 完了条件
- `src/native.ts` の単一巨大責務が解消され、機能ごとに分割されている
- 新公開API（`createSudachi` + オブジェクト引数）が導入されている
- CLI tokenize は新API経由で既存挙動を維持する
- `bun test` が全件パスする
