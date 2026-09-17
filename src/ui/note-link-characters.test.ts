import { describe, expect, it } from "vitest";

import { hasUnlinkableCharacters } from "./note-link-characters";

describe("hasUnlinkableCharacters", () => {
  it.each(["#", "^", "|", "[", "]"])("refuses %s", (character) => {
    expect(hasUnlinkableCharacters(`Alice ${character} 1`)).toBe(true);
  });

  it("accepts a folder path, spaces and an extension", () => {
    expect(hasUnlinkableCharacters("Attachments/scan 2026.pdf")).toBe(false);
  });
});
