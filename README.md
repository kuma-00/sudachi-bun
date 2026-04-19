# sudachi-bun

`sudachi-bun` は、Bun から Sudachi (Rust FFI) を使って日本語形態素解析を行うためのライブラリです。

この README は最小構成のみを記載します。  
細かい仕様は以下に分離しています。

- [詳細仕様](./docs/2026-04-19-specification.md)
- [CLI仕様](./docs/2026-04-19-cli.md)

## 前提

- Bun
- Rust (`cargo`)
- `unzip`（辞書展開用）

## セットアップ

```bash
bun install
cd sudachi-ffi && cargo build --release && cd ..
bun run setup:dict -- --type core --version latest --out ./dict
```

## ライブラリ利用（最小例）

```ts
import { createDictionary } from "sudachi-bun";

const dictionary = createDictionary({
  dictPath: "./dict/system_core.dic",
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
