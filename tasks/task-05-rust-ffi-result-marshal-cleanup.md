# Task 05: result marshal重複整理

## 目的
`sudachi-ffi/src/result/marshal.rs` にある結果変換とfree処理の重複を減らし、所有権処理の見通しを良くする。

## スコープ
- partial result cleanupの共通化
- `MorphemeResult`、`PretokenizedResult`、`LookupResultItem` 生成時のguardパターン整理
- raw slice/free処理の意図が分かる単位への分割

## 実装ステップ
1. C string変換、boxed slice変換、free array系を小さなhelper単位に整理する
2. result item生成時のdrop guard重複を共通helperへ寄せる
3. `Utf8OffsetMap` のUTF-16 code unit semanticsは変更しない
4. layout getter wrapperとABI構造体のfield orderは変更しない

## 完了条件
- memory ownershipの責務が局所化されている
- result/layout関連テストが既存期待値のまま通る
- `cd sudachi-ffi && cargo test` が通る
- `cd sudachi-ffi && cargo clippy` が通る

## 依存
- Task 04
