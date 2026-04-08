# sudachi-bun

To install dependencies:

```bash
bun install
```

Build the Rust FFI bridge:

```bash
cd sudachi-ffi
cargo build --release
```

Download and unpack a Sudachi dictionary:

```bash
bun run setup:dict -- --type core --version latest --out ./dict
```

If your dictionary artifact is hosted elsewhere, override the URL explicitly:

```bash
bun run setup:dict -- --url https://example.com/sudachi-dictionary.zip --out ./dict
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
