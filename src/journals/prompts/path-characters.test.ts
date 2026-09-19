import { describe, expect, it } from "vitest";

import { hasUnsafePathCharacters, UNSAFE_PATH_CHARACTERS } from "./path-characters";
import { PROMPT_PLACEHOLDER } from "./placeholder";

describe("hasUnsafePathCharacters", () => {
  it.each([...UNSAFE_PATH_CHARACTERS.split(" "), "\n", "\r", "\t", "\u{0}"])("refuses %j", (character) => {
    expect(hasUnsafePathCharacters(`a${character}b`)).toBe(true);
  });

  it.each(["good day", "café-2024.01", "(tired)", "semi;colon", "50% done", "a, b & c", "日本語"])(
    "accepts %j",
    (text) => {
      expect(hasUnsafePathCharacters(text)).toBe(false);
    },
  );

  it("accepts the placeholder, which stands in for an answer in the same place", () => {
    expect(hasUnsafePathCharacters(PROMPT_PLACEHOLDER)).toBe(false);
  });
});
