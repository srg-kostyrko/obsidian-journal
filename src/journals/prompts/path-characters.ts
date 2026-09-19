// Windows refuses `*"\/<>:|?` in a file name and a link breaks on `#^[]|`, both read out of
// app.js in the 1.8.7 asar. The union applies on every platform: the vault syncs, so a name this
// device accepts can still be one another device cannot write or link to. `/` is refused in the
// folder too — an answer fills one segment, and a subfolder nobody configured is not intent.
export const UNSAFE_PATH_CHARACTERS = String.raw`* " \ / < > : | ? # ^ [ ]`;

const UNSAFE = /[*"\\/<>:|?#^[\]\p{Cc}\p{Zl}\p{Zp}]/u;

/** Whether `text` holds a character, line break included, that no note name or folder may carry. */
export function hasUnsafePathCharacters(text: string): boolean {
  return UNSAFE.test(text);
}
