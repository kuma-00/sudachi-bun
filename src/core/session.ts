import type { Pointer } from "bun:ffi";
import { createNativeSudachiError } from "../native/error/mapper.ts";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  NativeLookupLibrary,
  NativeSudachiLibrary,
  PosMatcherResultLayout,
  PosTupleResultLayout,
} from "../native/types.ts";
import {
  loadLookupLibrary,
  loadNativeLibrary,
  readLookupResultLayout,
  readMorphemeResultLayout,
  readPosMatcherResultLayout,
  readPosTupleResultLayout,
} from "../native.ts";
import { openNativeHandleSession } from "../native-session.ts";
import { SudachiError, type TokenizerOptions } from "../types.ts";
import {
  createTokenizerGateway,
  type NativeLookupSession,
  type NativeTokenizerSession,
  type TokenizerGateway,
} from "./tokenizer-gateway.ts";

export type {
  NativeLookupSession,
  NativeTokenizerSession,
  TokenizerGateway,
} from "./tokenizer-gateway.ts";

function openNativeTokenizer(
  options: TokenizerOptions,
): NativeTokenizerSession {
  const library = loadNativeLibrary(options);
  return openNativeHandleSession(
    library,
    readMorphemeResultLayout,
    (loadedLibrary, handleOut) =>
      loadedLibrary.symbols.sudachi_create_tokenizer(
        options.configPath ?? null,
        options.resourceDir ?? null,
        options.dictPath,
        handleOut,
      ),
    (loadedLibrary, status) =>
      createNativeSudachiError(
        loadedLibrary,
        status,
        "Failed to create the tokenizer.",
      ),
    "Tokenizer handle was null after initialization.",
  );
}

export class TokenizerSessionManager {
  #library: NativeSudachiLibrary | null;
  #layout: MorphemeResultLayout | null;
  #handle: Pointer | null;
  #lookupLibrary: NativeLookupLibrary | null;
  #lookupLayout: LookupResultLayout | null;
  #posMatcherLayout: PosMatcherResultLayout | null;
  #posTupleLayout: PosTupleResultLayout | null;
  #gateway: TokenizerGateway | null;
  #loadOptions: TokenizerOptions;

  constructor(options: TokenizerOptions) {
    const session = openNativeTokenizer(options);

    this.#library = session.library;
    this.#layout = session.layout;
    this.#handle = session.handle;
    this.#lookupLibrary = null;
    this.#lookupLayout = null;
    this.#posMatcherLayout = null;
    this.#posTupleLayout = null;
    this.#gateway = null;
    this.#loadOptions = { ...options };
  }

  get closed(): boolean {
    return (
      this.#library === null || this.#handle === null || this.#layout === null
    );
  }

  getOpenSession(): NativeTokenizerSession {
    const library = this.#library;
    const layout = this.#layout;
    const handle = this.#handle;
    if (library === null || layout === null || handle === null) {
      throw new SudachiError("Tokenizer has been closed.", {
        code: "TOKENIZER_CLOSED",
      });
    }

    return { library, layout, handle };
  }

  getLookupSession(): NativeLookupSession {
    this.getOpenSession();

    if (this.#lookupLibrary !== null && this.#lookupLayout !== null) {
      return {
        library: this.#lookupLibrary,
        layout: this.#lookupLayout,
      };
    }

    const library = loadLookupLibrary(this.#loadOptions);
    try {
      const layout = readLookupResultLayout(library);
      this.#lookupLibrary = library;
      this.#lookupLayout = layout;
      return { library, layout };
    } catch (error) {
      library.close();
      throw error;
    }
  }

  getPosMatcherLayout(): PosMatcherResultLayout {
    this.getOpenSession();

    if (this.#posMatcherLayout !== null) {
      return this.#posMatcherLayout;
    }

    const layout = readPosMatcherResultLayout(this.getOpenSession().library);
    this.#posMatcherLayout = layout;
    return layout;
  }

  getPosTupleLayout(): PosTupleResultLayout | null {
    const { library } = this.getOpenSession();

    if (library.symbols.sudachi_get_pos_tuple_result_layout === undefined) {
      return null;
    }

    if (this.#posTupleLayout !== null) {
      return this.#posTupleLayout;
    }

    const layout = readPosTupleResultLayout(library);
    this.#posTupleLayout = layout;
    return layout;
  }

  getGateway(): TokenizerGateway {
    this.getOpenSession();

    if (this.#gateway !== null) {
      return this.#gateway;
    }

    const gateway = createTokenizerGateway({
      getOpenSession: () => this.getOpenSession(),
      getLookupSession: () => this.getLookupSession(),
      getPosMatcherLayout: () => this.getPosMatcherLayout(),
      getPosTupleLayout: () => this.getPosTupleLayout(),
    });
    this.#gateway = gateway;
    return gateway;
  }

  close(): void {
    if (this.#library === null) {
      return;
    }

    if (this.#lookupLibrary !== null) {
      this.#lookupLibrary.close();
      this.#lookupLibrary = null;
    }

    this.#lookupLayout = null;
    this.#posMatcherLayout = null;
    this.#posTupleLayout = null;
    this.#gateway = null;

    if (this.#handle !== null) {
      this.#library.symbols.sudachi_free_tokenizer(this.#handle);
    }

    this.#handle = null;
    this.#layout = null;
    this.#library.close();
    this.#library = null;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
