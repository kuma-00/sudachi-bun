# Task 05: Dictionary中心APIの導入

## 目的
- `createSudachi()` の分散ハンドル構造に加えて、Rust/Pythonの `Dictionary` 相当の統合エントリを提供する

## 主な変更
- `Dictionary` クラス（または同等ファクトリ）追加
- `create` / `lookup` / `posMatcher` / `preTokenizer` を一元化
- ライフサイクル管理（close/dispose）統一

## 実装ステップ
1. `Dictionary` エントリAPIを設計し型定義を追加する
2. tokenizer/splitter/pretokenizer 生成ロジックを Dictionary 配下へ移す
3. 既存 `createSudachi()` は薄いラッパとして維持または移行方針を定義する
4. close順序と例外処理を統一する
5. README とサンプルコードを Dictionary中心の記述へ更新する

## 影響範囲
- `/Users/kuma/Documents/code/sudachi-bun/src/sudachi.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/core.ts`
- `/Users/kuma/Documents/code/sudachi-bun/src/pretokenizer.ts`
- `/Users/kuma/Documents/code/sudachi-bun/index.ts`
- `/Users/kuma/Documents/code/sudachi-bun/README.md`

## 完了条件
- Dictionary中心APIで主要機能を一通り利用できる
- 既存API（`createSudachi`）の利用者が即時破綻しない移行導線がある
- close/disposeの資源解放漏れがない
