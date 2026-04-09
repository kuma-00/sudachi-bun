# sudachi-bun

`sudachi-bun` は、[Bun](https://bun.sh) から [Sudachi](https://github.com/WorksApplications/sudachi.rs) を使うための実験的なトークナイザ実装です。  
TypeScript から Rust FFI (`sudachi-ffi`) を呼び出して、日本語テキストの形態素解析を行います。

## できること

- Bun から Sudachi の形態素解析を実行
- CLI で `--mode A|B|C` の分割モードや `--wakati` / `--output <path>` を指定して出力
- TypeScript API (`Tokenizer`) から直接トークナイズ
- Sudachi 辞書のダウンロードと展開を補助するセットアップスクリプトを提供

## 前提条件

- Bun 1.3 以上
- Rust ツールチェーン（`cargo` が使えること）
- `unzip` コマンド（辞書 ZIP 展開に必要）

> `sudachi-ffi` は `sudachi.rs` を GitHub から取得してビルドします。初回ビルド時はネットワーク接続が必要です。

## クイックスタート

### 1. 依存関係をインストール

```bash
bun install
```

### 2. Rust FFI をビルド

```bash
cd sudachi-ffi
cargo build --release
cd ..
```

### 3. 辞書を取得

```bash
bun run setup:dict -- --type core --version latest --out ./dict
```

### 4. CLI を実行

```bash
bun run index.ts --dict-path ./dict/system_core.dic --text "すもももももももものうち"
bun run index.ts --dict-path ./dict/system_core.dic --wakati --text "すもももももももものうち"
bun run index.ts --dict-path ./dict/system_core.dic --output - --text "すもももももももものうち"
bun run index.ts --dict-path ./dict/system_core.dic --output ./tokens.json --text "すもももももももものうち"
```

## CLI 使い方

基本形式:

```bash
bun run index.ts --dict-path <path-to-dic> [options]
```

現在、`build` / `ubuild` / `dump` のサブコマンドは scaffold 済みですが、まだ実装されていません。

```bash
bun run index.ts build --help
bun run index.ts ubuild --help
bun run index.ts dump --help
```

### 主なオプション

- `--dict-path <path>`: Sudachi 辞書ファイル（必須）
- `--config-path <path>`: Sudachi 設定ファイル（任意）
- `--library-path <path>`: ネイティブライブラリの明示指定（任意）
- `--mode <A|B|C>`: 分割モード（デフォルト: `C`）
- `--wakati`: 分かち書きモードで出力
- `--output <path>`: 出力先ファイルを指定。`-` を指定すると標準出力に出力
- `--text "<text>"`: 解析対象テキスト（デフォルト: `すもももももももものうち`）

### 環境変数

- `SUDACHI_DICT_PATH` または `SUDACHI_DICTIONARY_PATH`
- `SUDACHI_CONFIG_PATH`
- `SUDACHI_FFI_PATH`
- `SUDACHI_FFI_DIR`（`library-path` 未指定時の探索ディレクトリ）

`library-path` 未指定時は、以下の順でライブラリを探索します。

1. `SUDACHI_FFI_DIR`（指定時）
2. `./sudachi-ffi/target/release`
3. `./sudachi-ffi/target/debug`

候補ファイル名:

- `libsudachi_ffi.<platform suffix>`
- `sudachi_ffi.<platform suffix>`

## 辞書セットアップスクリプト

`scripts/setup-dict.ts` は SudachiDict の GitHub Releases から辞書アセットを選択してダウンロード・展開します。

```bash
bun run setup:dict -- [options]
```

主なオプション:

- `--type core|small|full`（デフォルト: `core`）
- `--version <tag|latest>`（デフォルト: `latest`）
- `--out <dir>`（デフォルト: `./dict`）
- `--url <zip-url>`（独自配布元を使う場合）

例:

```bash
bun run setup:dict -- --type full --version v20240416 --out ./dict
bun run setup:dict -- --url https://example.com/sudachi-dictionary.zip --out ./dict
```

## TypeScript API

```ts
import { Tokenizer } from "sudachi-bun";

const tokenizer = Tokenizer.load({
  dictPath: "./dict/system_core.dic",
  // configPath: "./dict/sudachi.json",
  // libraryPath: "./sudachi-ffi/target/release/libsudachi_ffi.dylib",
});

try {
  const morphemes = tokenizer.tokenize("東京都に行った", "C");
  console.log(morphemes);
} finally {
  tokenizer.close();
}
```

`Morpheme` は以下の情報を含みます。

- `surface`
- `normalized`
- `dictionaryForm`
- `reading`
- `pos`
- `begin`, `end`
- `wordId`, `posId`, `dictionaryId`
- `isOov`
- `synonymGroupIds`

## 開発者向け

### テスト

```bash
bun test
```

### エントリーポイント

- [index.ts](/Users/kuma/Documents/code/sudachi-bun/index.ts): 公開 API と CLI 起動
- [src/core.ts](/Users/kuma/Documents/code/sudachi-bun/src/core.ts): `Tokenizer` 本体
- [src/cli.ts](/Users/kuma/Documents/code/sudachi-bun/src/cli.ts): CLI 引数処理と実行
- [src/native.ts](/Users/kuma/Documents/code/sudachi-bun/src/native.ts): Bun FFI ロードとネイティブ連携
- [scripts/setup-dict.ts](/Users/kuma/Documents/code/sudachi-bun/scripts/setup-dict.ts): 辞書セットアップ

## トラブルシュート

- `Could not find the Sudachi native library.`:
  `cd sudachi-ffi && cargo build --release` を実行し、`--library-path` または `SUDACHI_FFI_PATH` を確認してください。
- 辞書ダウンロードに失敗する:
  ネットワーク接続、`--version` のタグ、または `--url` の配布元 URL を確認してください。
- 辞書展開に失敗する:
  `unzip` がインストールされているか確認してください。
