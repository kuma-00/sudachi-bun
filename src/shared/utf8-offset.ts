export interface Utf8ByteOffsetErrorMessages {
  outOfRange: (offset: number) => string;
  notBoundary: (offset: number) => string;
}

export interface Utf8ByteOffsetIndexMapOptions {
  throwInvalid: (message: string) => never;
  messages: Utf8ByteOffsetErrorMessages;
}

export function createUtf8ByteOffsetIndexMap(
  text: string,
  offsets: readonly number[],
  options: Utf8ByteOffsetIndexMapOptions,
): Map<number, number> {
  const uniqueOffsets = [...new Set(offsets)].sort(
    (left, right) => left - right,
  );
  const totalBytes = Buffer.byteLength(text, "utf8");

  for (const offset of uniqueOffsets) {
    if (!Number.isInteger(offset) || offset < 0 || offset > totalBytes) {
      options.throwInvalid(options.messages.outOfRange(offset));
    }
  }

  const resolved = new Map<number, number>();
  let targetIndex = 0;

  while (
    targetIndex < uniqueOffsets.length &&
    uniqueOffsets[targetIndex] === 0
  ) {
    resolved.set(0, 0);
    targetIndex += 1;
  }

  let byteOffset = 0;
  for (
    let textIndex = 0;
    textIndex < text.length && targetIndex < uniqueOffsets.length;
  ) {
    const codePoint = text.codePointAt(textIndex);
    if (codePoint === undefined) {
      break;
    }

    const codePointText = String.fromCodePoint(codePoint);
    byteOffset += Buffer.byteLength(codePointText, "utf8");
    textIndex += codePoint > 0xffff ? 2 : 1;

    while (
      targetIndex < uniqueOffsets.length &&
      uniqueOffsets[targetIndex] === byteOffset
    ) {
      resolved.set(byteOffset, textIndex);
      targetIndex += 1;
    }
  }

  if (targetIndex !== uniqueOffsets.length) {
    const invalidOffset = uniqueOffsets[targetIndex];
    if (invalidOffset === undefined) {
      options.throwInvalid(options.messages.notBoundary(totalBytes));
    }

    options.throwInvalid(options.messages.notBoundary(invalidOffset));
  }

  return resolved;
}
