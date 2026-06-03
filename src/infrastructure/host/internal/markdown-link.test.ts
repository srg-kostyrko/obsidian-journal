import { describe, expect, it } from "vitest";

import { buildMarkdownLink } from "./markdown-link";

import type { MarkdownLinkInput } from "./markdown-link";

function input(overrides: Partial<MarkdownLinkInput> = {}): MarkdownLinkInput {
  return {
    pathWithoutExtension: "Journals/2026/2026-01-01",
    basename: "2026-01-01",
    useMarkdownLinks: false,
    format: "shortest",
    ambiguous: false,
    ...overrides,
  };
}

describe("buildMarkdownLink", () => {
  describe("wikilinks", () => {
    it("uses the bare basename when shortest and unambiguous", () => {
      expect(buildMarkdownLink(input())).toBe("[[2026-01-01]]");
    });

    it("uses the full path when the basename is ambiguous", () => {
      expect(buildMarkdownLink(input({ ambiguous: true }))).toBe("[[Journals/2026/2026-01-01]]");
    });

    it("uses the full path when the format is absolute", () => {
      expect(buildMarkdownLink(input({ format: "absolute" }))).toBe("[[Journals/2026/2026-01-01]]");
    });
  });

  describe("markdown links", () => {
    it("labels with the basename and targets the shortest path", () => {
      expect(buildMarkdownLink(input({ useMarkdownLinks: true }))).toBe("[2026-01-01](2026-01-01.md)");
    });

    it("wraps targets containing spaces in angle brackets", () => {
      expect(
        buildMarkdownLink(
          input({ useMarkdownLinks: true, ambiguous: true, pathWithoutExtension: "Daily Notes/2026-01-01" }),
        ),
      ).toBe("[2026-01-01](<Daily Notes/2026-01-01.md>)");
    });
  });
});
