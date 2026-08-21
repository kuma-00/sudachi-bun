# sudachi-bun 詳細仕様

## 概要

`sudachi-bun` は TypeScript から Rust FFI (`sudachi-ffi`) を呼び出し、Sudachi による形態素解析を提供します。

- 形態素解析（複数 projection 対応）
- 文分割（UTF-8 byte offset ベース）
- 再分割 API（単一 morpheme / morpheme list）
- lookup API
- POS API
- Stateful tokenizer API
- Pretokenizer API / HuggingFace 連携
- 辞書セットアップ補助（ダウンロード・展開）

## 初期化 API

### `createDictionary(options)`

辞書ハンドルを生成します。主なオプション:

- `dictPath` (required): Sudachi 辞書パス
- `configPath` (optional): 設定ファイルパス
- `libraryPath` (optional): ネイティブライブラリ明示指定

戻り値:

- `tokenizer`
- `splitter`
- `pretokenizer`
- `close()`

互換 API として `createSudachi` も利用できます。

## Tokenizer API

### `tokenize({ text, projection, mode, subset? })`

`projection` は必須:

- `surface`
- `normalized`
- `dictionary_form`
- `reading`
- `dictionary_and_surface`
- `normalized_and_surface`
- `normalized_nouns`

`mode` は `A | B | C`（デフォルトは実装側設定）。

### `split({ morpheme, projection, mode })`

既存単一 morpheme を再分割します。

### `splitInto({ morphemes, projection, mode })`

morpheme 配列を再分割します。

### `lookup({ surface, projection })`

入力 surface に一致する候補を `LookupEntry[]` で返します。

### `posOf(posId)`

`posId` から `PosTuple`（6要素）を返します。未知 ID は `null`。

### `createStatefulTokenizer({ text?, mode?, subset? })`

状態付き API を生成し、以下を利用できます:

- `reset(text?)`
- `setMode(mode)`
- `setSubset(subset)`
- `doTokenize({ projection })`
- `tokenize({ projection })`

## Sentence Splitter API

`splitter` は UTF-8 byte offset を基準に文境界を返します。

- `split(text): SentenceSpan[]`
- `getEos(text): number | null`
- `withLimit(limit).getEos(text): number | null`

`SentenceSpan` は `text`, `start`, `end` を持ちます。

## Pretokenizer API

### `pretokenizer.pretokenize(text, options?)`

出力 token は byte offset と char index の両方を保持:

- `beginByte`, `endByte`
- `beginChar`, `endChar`

`subset.fields` には `surface`, `headWordLength`, `pos`, `posId`, `normalized`, `dictionaryForm`, `reading`, `splitA`, `splitB`, `wordStructure`, `synonymGroupIds` を指定できます。

## HuggingFace 連携

### `createHuggingFacePretokenizer(pretokenizer, options?)`

`handler(tokens)` でトークン列を加工できます。

補足:

- `pre_tokenize(pretok)` は normalized text への slice 投影のため surface projection 前提
- 非 surface projection を `pre_tokenize(pretok)` で使うと例外
- raw string ベース確認には `pre_tokenize_str()` / `pre_tokenize_text()` を使用

## Morpheme / LookupEntry

`Morpheme` 主な項目:

- `surface`
- `headWordLength`
- `normalized`
- `dictionaryForm`
- `reading`
- `pos`
- `begin`, `end` (UTF-8 byte offset)
- `beginChar`, `endChar` (JS string index)
- `wordId`, `posId`, `dictionaryId`
- `isOov`
- `totalCost`
- `splitA`, `splitB`, `wordStructure`
- `synonymGroupIds`
- `getWordInfo()`

`tokenize()` / `split()` / `splitInto()` / `stateful.doTokenize()` の戻り配列には `internalCost` が付与されます。

`LookupEntry` 主な項目:

- `surface`
- `headWordLength`
- `pos`
- `wordId`, `dictionaryId`
- `isOov`
- `splitA`, `splitB`, `wordStructure`

## 辞書セットアップ

### CLI スクリプト

`scripts/setup-dict.ts` は SudachiDict のリリースから辞書をダウンロード・展開します。

主なオプション:

- `--type core|small|full`（default: `core`）
- `--version <YYYYMMDD|vYYYYMMDD|latest>`（default: `latest`）
- `--out <dir>`（default: `./dict`）
- `--url <archive-url>`（wheel または legacy ZIP の独自配布元。辞書を含まない `.tar.gz` は指定不可）

カスタムアーカイブのバージョンは、リリースタグ、URL のファイル名、アーカイブ内の wheel `dist-info` または legacy ZIP のパス、明示した `--version` の順に解決します。これらから数値バージョンを推論できない場合、`--version 20260116` のように数値のバージョンを明示する必要があります。`latest` やその他の非数値バージョンを保存することはできません。

セットアップ完了時、CLI は解決した結果を標準出力に表示します。出力には `version`、辞書ファイルの絶対パス `dictPath`、リソースディレクトリの絶対パス `resourceDir`、既定設定ファイルの絶対パス `defaultConfigPath` を含めます。利用側は表示された `dictPath` などをそのまま `createDictionary()` のオプションに指定できます。

### ライブラリ API

`ensureDictionary()` でも同等処理が可能です。既存辞書があれば再利用し、未存在時のみ取得します。

## トラブルシュート

- ネイティブライブラリ未検出:
  `cd sudachi-ffi && cargo build --release`
- splitter / lookup などのシンボル不整合:
  `sudachi-ffi` を最新で再ビルド
- 辞書ダウンロード失敗:
  ネットワーク、タグ、URL を確認
- 展開失敗:
  `unzip` の導入を確認（wheel は ZIP 互換形式）
