# sudachi.rs 差分の未実装チェックリスト

- [x] CLI: `build` / `ubuild` / `dump` サブコマンド対応
- [ ] CLI: `--wakati` / `--all` / `--output` 対応
- [ ] CLI: `--split-sentences` / `--debug` / `--resource_dir` 対応
- [ ] CLI: stdin / ファイル入力処理対応（`--text` 以外）
- [ ] API: 文分割機能（`SentenceSplitter` 相当）公開
- [ ] API: 形態素再分割（`Morpheme.split` / `MorphemeList.split_into` 相当）対応
- [ ] API: 辞書直接検索（`lookup`）対応
- [ ] API: POS matcher 相当の導入
- [ ] API: フィールドサブセット指定（`InfoSubset` 相当）対応
- [ ] API: Surface projection 対応
- [ ] API: Pretokenizer（HuggingFace tokenizers 連携）対応
- [ ] API/FFI: Tokenizer のデバッグ切替対応
