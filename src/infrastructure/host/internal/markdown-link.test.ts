import { describe, expect, it } from "vitest";

import { buildMarkdownLink } from "./markdown-link";

import type { MarkdownLinkInput } from "./markdown-link";

function input(overrides: Partial<MarkdownLinkInput> = {}): MarkdownLinkInput {
  return {
    pathWithoutExtension: "Journals/2026/2026-01-01",
    basename: "2026-01-01",
    useMarkdownLinks: false,
    ...overrides,
  };
}

describe("buildMarkdownLink", () => {
  describe("wikilinks", () => {
    it("targets the full path so the note lands in the journal folder", () => {
      expect(buildMarkdownLink(input())).toBe("[[Journals/2026/2026-01-01|2026-01-01]]");
    });

    it("omits the alias when the note sits at the vault root", () => {
      expect(buildMarkdownLink(input({ pathWithoutExtension: "2026-01-01" }))).toBe("[[2026-01-01]]");
    });
  });

  describe("markdown links", () => {
    it("labels with the note name and targets the full path", () => {
      expect(buildMarkdownLink(input({ useMarkdownLinks: true }))).toBe("[2026-01-01](Journals/2026/2026-01-01.md)");
    });

    it("wraps targets containing spaces in angle brackets", () => {
      expect(buildMarkdownLink(input({ useMarkdownLinks: true, pathWithoutExtension: "Daily Notes/2026-01-01" }))).toBe(
        "[2026-01-01](<Daily Notes/2026-01-01.md>)",
      );
    });
  });
});
