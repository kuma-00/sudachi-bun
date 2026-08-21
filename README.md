# sudachi-bun

`sudachi-bun` は、Bun から Sudachi (Rust FFI) を使って日本語形態素解析を行うためのライブラリです。

この README は最小構成のみを記載します。  
細かい仕様は以下に分離しています。

- [詳細仕様](./docs/2026-04-19-specification.md)
- [CLI仕様](./docs/2026-04-19-cli.md)

## 前提

- Bun
- Rust (`cargo`)
- `unzip`（wheel/ZIP 辞書展開用）

## セットアップ

```bash
bun install
bun run setup:dict -- --type core --version latest --out ./dict
```

`setup:dict` は辞書アーカイブに加えて `sudachi.rs` の `resources` も `./dict/resources` にダウンロードします。  
辞書ファイルと `resources` は分離して保持され、`resources/system.dic` は作成しません。必要な場合は `dictPath` / `resourceDir` / `configPath` を利用側で明示指定してください。
セットアップ完了時に、解決した `version`、`dictPath`、`resourceDir`、`defaultConfigPath` を絶対パスで表示します。利用側では、その出力の `dictPath` を指定してください（例: `dictPath: /work/project/dict/sudachi-dictionary-20260116/system_core.dic`）。

公式配布は wheel（ZIP 互換）を使用します。`--url <archive-url>` では wheel または legacy ZIP を指定できますが、辞書を含まない `.tar.gz` は指定できません。URL のファイル名やアーカイブ内から数値バージョンを推論できないカスタムアーカイブでは、数値の `--version`（例: `--version 20260116`）を指定してください。

`bun install` 時にネイティブライブラリを自動準備します（環境一致の配布バイナリをダウンロードし、見つからない場合は `cargo build --release` を試行）。

利用可能な環境変数:

- `SUDACHI_FFI_BINARY_URL`: 配布バイナリの直接URL
- `SUDACHI_FFI_BINARY_NAME`: `SUDACHI_FFI_BINARY_URL` を保存するファイル名（ディレクトリ不可）
- `SUDACHI_FFI_GITHUB_REPOSITORY`: `owner/repo` 形式でリリース取得元を明示

リリース取得元の優先順位:

1. `SUDACHI_FFI_GITHUB_REPOSITORY`
2. `GITHUB_REPOSITORY`
3. 既定値（`kuma-00/sudachi-bun`）

## ライブラリ利用（最小例）

```ts
import { createDictionary } from "sudachi-bun";

const dictionary = createDictionary({
  // setup:dict の完了出力に表示された dictPath を指定します。
  dictPath: "/work/project/dict/sudachi-dictionary-20260116/system_core.dic",
});

try {
  const tokens = dictionary.tokenizer.tokenize({
    text: "すもももももももものうち",
    projection: "surface",
    mode: "C",
  });
  console.log(tokens);
} finally {
  dictionary.close();
}
```

## 開発

```bash
bun test
cd sudachi-ffi && cargo test && cargo clippy && cd ..
bunx tsc --noEmit
bun run biome:check
```
