import { describe, expect, it } from "vitest";

import { hasUnlinkableCharacters, toNoteLink } from "./note-link";

describe("toNoteLink", () => {
  it("wraps the trimmed text in brackets", () => {
    expect(toNoteLink("  Projects/Roadmap  ")).toBe("[[Projects/Roadmap]]");
  });

  it.each(["", " ".repeat(3)])("reads %j as no answer", (text) => {
    expect(toNoteLink(text)).toBeUndefined();
  });
});

describe("hasUnlinkableCharacters", () => {
  it.each(["#", "^", "|", "[", "]"])("refuses %s", (character) => {
    expect(hasUnlinkableCharacters(`Alice ${character} 1`)).toBe(true);
  });

  it("accepts a folder path, spaces and an extension", () => {
    expect(hasUnlinkableCharacters("Attachments/scan 2026.pdf")).toBe(false);
  });
});
