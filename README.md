# sudachi-bun

`sudachi-bun` は、[Bun](https://bun.sh) から [Sudachi](https://github.com/WorksApplications/sudachi.rs) を使うための実験的なトークナイザ実装です。  
TypeScript から Rust FFI (`sudachi-ffi`) を呼び出して、日本語テキストの形態素解析と文分割を行います。

## できること

- Bun から Sudachi の形態素解析を実行
- Rust 側の sentence splitter を通して `SentenceSpan[]` を取得し、UTF-8 バイトオフセットをそのまま扱う
- CLI の `tokenize` サブコマンドで `--mode A|B|C` の分割モードと必須の `--projection surface|normalized|dictionary_form|reading`、`--wakati` / `--all` / `--output <path>`、`--split-sentences` / `--debug` / `--resource-dir` を指定して出力
- CLI で `--text`、stdin、位置引数のファイル入力に対応
- TypeScript API として package root の `createSudachi` から tokenizer/splitter/pretokenizer をまとめて生成
- TypeScript API として package root の `createHuggingFacePretokenizer` から HuggingFace tokenizers 向けアダプタを生成
- TypeScript API から既存 morpheme の再分割（単一 morpheme / morpheme list）
- TypeScript API から辞書 lookup 候補を `LookupEntry[]` として取得
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
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --wakati --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection normalized --all --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --output - --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --output ./tokens.json --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --split-sentences --text "今日は晴れです。明日も晴れです。"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --debug --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface --resource-dir ./dict --text "すもももももももものうち"
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface input.txt
bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface input-a.txt input-b.txt
echo "すもももももももものうち" | bun run index.ts tokenize --dict-path ./dict/system_core.dic --projection surface
```

## CLI 使い方

基本形式:

```bash
bun run index.ts tokenize --dict-path <path-to-dic> --projection <surface|normalized|dictionary_form|reading> [options] [input-file ...]
```

`tokenize` 以外に `build` / `ubuild` / `dump` サブコマンドがありますが、現在は scaffold のみで未実装です。これらのコマンドでは tokenize 用フラグ（例: `--dict-path`）は受け付けません。

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
- `--projection <surface|normalized|dictionary_form|reading>`: 表示値の投影。必須。`surface` は表層、`normalized` は正規化形、`dictionary_form` は辞書形、`reading` は読みを出力する
- `--wakati`: 分かち書きモードで出力。`--projection` の結果を使って表示する
- `--all`: すべてのトークン情報を出力。`surface` 系の表示は `--projection` の結果に従う
- `--output <path>`: 出力先ファイルを指定。`-` を指定すると標準出力に出力
- `--text "<text>"`: 解析対象テキスト（未指定時は位置引数ファイルまたは stdin から解決）
- `--split-sentences`: 入力を文単位に分けて解析する。文境界の byte offset は Rust 側 sentence splitter の結果をそのまま使う
- `--debug`: デバッグ情報を標準エラー出力に追加する。標準出力の解析結果はそのまま維持される
  - `[debug] tokenize ...` 形式の実行条件ログと、lookup シンボルが利用可能な場合は `Tokenizer.lookup()` の診断を stderr に出力する
- `--resource-dir <path>`: 辞書・設定の探索基準ディレクトリを指定する

### 入力ソース

- `--text` を指定した場合は、その文字列を解析する
- `--text` がない場合は、位置引数で指定したファイルを順に読み込む
- 位置引数のファイルがなく、stdin がパイプ接続されている場合は stdin を読み込む
- `--text` とファイル/ stdin の併用はエラー
- ファイル指定と stdin の併用もエラー
- 複数ファイルを指定した場合は、指定順に読み込み、ひとつの入力として連結して扱う

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

ライブラリ利用時にも同等の処理を実行できます。

```ts
import { ensureDictionary } from "sudachi-bun";

const installed = await ensureDictionary({
  type: "core",
  version: "latest",
  outDir: "./dict",
});

console.log(installed.dictPath);
```

`ensureDictionary()` は、指定ディレクトリ内に既存辞書があれば再利用し、見つからない場合のみダウンロードと展開を行います。強制再ダウンロードしたい場合は `forceDownload: true` を指定します。

## TypeScript API

`createSudachi` を package root から import して使います。

```ts
import { createSudachi } from "sudachi-bun";

const sudachi = createSudachi({
  dictPath: "./dict/system_core.dic",
  // configPath: "./dict/sudachi.json",
  // libraryPath: "./sudachi-ffi/target/release/libsudachi_ffi.dylib",
});

try {
  const { tokenizer, splitter, pretokenizer } = sudachi;
  const text = "今日は晴れです。明日も晴れです。";
  const tokenText = "東京都に";
  const tokens = tokenizer.tokenize({ text: tokenText, projection: "surface", mode: "C" });
  const lookup = tokenizer.lookup({ surface: "東京", projection: "surface" });
  const finer = tokenizer.split({ morpheme: tokens[0], projection: "surface", mode: "A" });
  const flattened = tokenizer.splitInto({ morphemes: tokens, projection: "surface", mode: "A" });
  const pretokenized = pretokenizer.pretokenize("東京タワー");
  console.log(lookup, finer, flattened);
  console.log(pretokenized);

  for (const span of splitter.split(text)) {
    const morphemes = tokenizer.tokenize({ text: span.text, projection: "surface", mode: "C" });
    console.log(span.start, span.end, morphemes);
  }
} finally {
  sudachi.close();
}
```

`projection` は `tokenizer.tokenize()` / `tokenizer.lookup()` / `tokenizer.split()` / `tokenizer.splitInto()` の必須プロパティです。サポートする値は `surface`, `normalized`, `dictionary_form`, `reading` です。`Morpheme.surface` と `LookupEntry.surface` はこの投影結果を持ち、`--wakati` もこの値を使って表示します。

`createSudachi()` が返す `splitter` は Rust FFI の sentence splitter ハンドルを保持し、`split(text)` で `SentenceSpan[]` を返します。各 span は文テキスト `text` と UTF-8 バイトオフセット `start` / `end` を持ちます。

`createSudachi()` が返す `tokenizer` には Task-06 相当の再分割 API があります。

- `tokenizer.split({ morpheme, projection, mode })`: 既存の単一 morpheme をより細かい `mode` へ再分割する
- `tokenizer.splitInto({ morphemes, projection, mode })`: morpheme list 全体を再分割する

どちらも `tokenize()` と同じ `Morpheme[]` を返し、内部では既存の morpheme 読み出し処理を再利用します。`splitInto()` は `tokenize()` や `split()` が返した配列をそのまま渡した場合はネイティブの list resplit を使い、コピー済み配列のように list コンテキストが失われた場合は各 morpheme の `split()` を順に適用します。

`split()` / `splitInto()` は、同じ `tokenizer` が生成した morpheme のみ受け付けます。`tokenize({ text, projection, mode })` との差分として、再分割は既存解析結果を起点にするため、元トークン境界に従って細分化されます。

Task-03 相当の stateful API も利用できます。

- `tokenizer.createStatefulTokenizer({ text?, mode?, subset? })`: 状態付きトークナイザを生成する
- `stateful.reset(text?)`: 入力テキストを差し替える（省略時は空文字）
- `stateful.setMode(mode)`: 解析モードを更新する
- `stateful.setSubset(subset)`: 取得する形態素情報 subset を更新する
- `stateful.doTokenize({ projection })` / `stateful.tokenize({ projection })`: 現在状態で解析実行する

```ts
const stateful = tokenizer.createStatefulTokenizer({ mode: "C" });
stateful.reset("東京都に");
const cTokens = stateful.doTokenize({ projection: "surface" });
stateful.setMode("A");
const aTokens = stateful.tokenize({ projection: "surface" });
```

Task-07 相当の lookup API も利用できます。

- `tokenizer.lookup({ surface, projection })`: 入力 surface に一致する辞書候補を `LookupEntry[]` として返す

`LookupEntry` は `surface`, `pos`, `wordId`, `dictionaryId`, `isOov` を持ちます。lookup 用の Rust FFI シンボルが未実装または古いライブラリでは `lookup()` が失敗するため、その場合は最新の `sudachi-ffi` をビルドしてください。

`createSudachi()` が返す `pretokenizer` は辞書設定から pretokenized 形式を生成する API です。

```ts
import { createSudachi } from "sudachi-bun";

const { pretokenizer } = createSudachi({
  dictPath: "./dict/system_core.dic",
});

const tokens = pretokenizer.pretokenize("東京タワー", {
  mode: "C",
  projection: "surface",
  subset: { fields: ["surface", "pos"] },
});
```

Pretokenizer の各トークンは、UTF-8 byte offset と character index の両方を保持します。

- `beginByte` / `endByte`: 元テキストに対する UTF-8 byte offset
- `beginChar` / `endChar`: 元テキストに対する JavaScript string index

`debug: true` を指定した場合は、Pretokenizer の解析ごとに stderr へ 1 行の JSONL を出力します。主な項目は `mode`, `split_mode`, `projection`, `subset_bits`, `input_bytes`, `token_count`, `elapsed_us` です。

byte は Rust 側の生の UTF-8 オフセット、char は JavaScript string index として扱う文字位置です。`Morpheme` と pretokenized 出力の両方でこの境界を共有します。

`createHuggingFacePretokenizer()` は `Pretokenizer` を HuggingFace tokenizers の pre-tokenizer として使うためのアダプタです。第2引数の `PretokenizeOptions`（`mode` / `projection` / `subset`）は内部の `pretokenize` 呼び出しへ渡されますが、HuggingFace 側の `pre_tokenize(pretok)` は surface projection のみ対応し、`projection: "reading"` などの非 surface projection は例外になります。raw string の確認用には `pre_tokenize_str()` と `pre_tokenize_text()` があり、こちらは projected token text をそのまま返します。byte offset が必要な場合は、`Pretokenizer` の生の出力にある `beginByte` / `endByte` を参照してください。

```ts
import { createHuggingFacePretokenizer, createSudachi } from "sudachi-bun";

const sudachi = createSudachi({
  dictPath: "./dict/system_core.dic",
});

const hfPretokenizer = createHuggingFacePretokenizer(sudachi.pretokenizer, {
  projection: "surface",
});
```

`Morpheme` は以下の情報を含みます。

- `surface`
- `normalized`
- `dictionaryForm`
- `reading`
- `pos`
- `begin`, `end`（UTF-8 byte offset）
- `beginChar`, `endChar`（JavaScript string index）
- `wordId`, `posId`, `dictionaryId`
- `isOov`
- `synonymGroupIds`

## 開発者向け

### テスト

```bash
bun test
```

sentence splitter のユニットテストはネイティブ動作をモックし、TypeScript 側では span 変換と CLI の offset 補正を検証します。

### エントリーポイント

- [index.ts](/Users/kuma/Documents/code/sudachi-bun/index.ts): 公開 API と CLI 起動
- [src/core.ts](/Users/kuma/Documents/code/sudachi-bun/src/core.ts): `Tokenizer` 本体
- [src/cli.ts](/Users/kuma/Documents/code/sudachi-bun/src/cli.ts): CLI 引数処理と実行
- [src/native.ts](/Users/kuma/Documents/code/sudachi-bun/src/native.ts): Bun FFI ロードとネイティブ連携
- [src/sentence-splitter.ts](/Users/kuma/Documents/code/sudachi-bun/src/sentence-splitter.ts): Rust sentence splitter の TypeScript ラッパー
- [scripts/setup-dict.ts](/Users/kuma/Documents/code/sudachi-bun/scripts/setup-dict.ts): 辞書セットアップ

## トラブルシュート

- `Could not find the Sudachi native library.`:
  `cd sudachi-ffi && cargo build --release` を実行し、`--library-path` または `SUDACHI_FFI_PATH` を確認してください。
- sentence splitter 関連のシンボル解決に失敗する:
  Rust 側の sentence splitter FFI がまだ含まれていない可能性があります。最新の `sudachi-ffi` をビルドしてライブラリを更新してください。
- 辞書ダウンロードに失敗する:
  ネットワーク接続、`--version` のタグ、または `--url` の配布元 URL を確認してください。
- 辞書展開に失敗する:
  `unzip` がインストールされているか確認してください。
