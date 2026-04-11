# Task 08: テスト再構成と回帰検証

## 目的
再設計後の構造に合わせてテストを再配置し、機能回帰を防止する。

## スコープ
- 新モジュール境界に対応した単体テスト追加/更新
- 旧API前提テストの新API移行
- CLI統合テストの回帰確認

## 実装ステップ
1. native loader/layout/error をモジュール単位でテスト再編
2. core/session/operations の境界テストを gateway 前提に更新
3. index/API エクスポートテストを `createSudachi` 前提に更新
4. CLI tokenize の既存シナリオ（projection/split/debug/input source）を再実行
5. `bun test` で全件確認し、未検証ギャップを記録

## 完了条件
- `bun test` が全件パス
- 新API導入後の主要機能（tokenize/lookup/split/splitInto/sentence split/pretokenize/CLI）が回帰なし
- 失敗時の native エラーメッセージ系テストが維持

## 依存
- Task 02
- Task 03
- Task 04
- Task 05
- Task 06
- Task 07

