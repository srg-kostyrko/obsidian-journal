import { describe, expect, it } from "vitest";

import { countNoteSize } from "./note-size";

describe("countNoteSize", () => {
  describe("words", () => {
    it("counts space-delimited words", () => {
      expect(countNoteSize("one two three").words).toBe(3);
    });

    it("counts a hyphenated word as one", () => {
      expect(countNoteSize("well-known").words).toBe(1);
    });

    it("counts an apostrophized word as one", () => {
      expect(countNoteSize("don't").words).toBe(1);
    });

    it("counts a number with separators as one word", () => {
      expect(countNoteSize("I caught 1,234.5 fish").words).toBe(4);
    });

    it("counts each CJK character as one word", () => {
      expect(countNoteSize("今日は良い天気").words).toBe(7);
    });

    it("returns zero for empty content", () => {
      expect(countNoteSize("").words).toBe(0);
    });

    it("counts words inside code blocks", () => {
      expect(countNoteSize("```\nconst a = 1\n```").words).toBe(3);
    });

    it("counts words inside comments", () => {
      expect(countNoteSize("%%write three words%%").words).toBe(3);
    });
  });

  describe("frontmatter", () => {
    it("excludes frontmatter from both counts", () => {
      const result = countNoteSize("---\ntags: alpha beta\n---\nbody text\n");
      expect(result.words).toBe(2);
      expect(result.characters).toBe("body text\n".length);
    });

    it("counts everything when frontmatter is unterminated", () => {
      // A run of bare hyphens matches the word pattern's own class, so the leading "---"
      // counts as its own word once it is left in the body: tags, alpha, body, text, plus "---".
      expect(countNoteSize("---\ntags: alpha\nbody text\n").words).toBe(5);
    });

    it("counts everything when the opening delimiter is not alone on its line", () => {
      expect(countNoteSize("--- not frontmatter\nbody\n").words).toBe(4);
    });

    it("counts everything when there is no frontmatter", () => {
      expect(countNoteSize("body text").words).toBe(2);
    });

    it("counts everything when the opening delimiter has trailing whitespace before the newline", () => {
      // Obsidian's own opening-delimiter regex (`/^---(\r?\n)/`) requires "---" immediately
      // followed by the line break, so trailing spaces here mean this never opens frontmatter.
      expect(countNoteSize("---   \nfoo\n---\nbody").words).toBe(4);
    });

    it("counts everything when the closing delimiter has trailing whitespace before the newline", () => {
      // Same rule applied to the close: Obsidian's closing regex (`/---(\r?\n|$)/`) requires
      // "---" immediately followed by the line break, so this "close" is never recognized and
      // the block reads as unterminated.
      expect(countNoteSize("---\nfoo\n---   \nbody").words).toBe(4);
    });

    it("strips CRLF frontmatter", () => {
      const result = countNoteSize("---\r\nfoo\r\n---\r\nbody");
      expect(result.words).toBe(1);
      expect(result.characters).toBe("body".length);
    });

    it("requires the closing delimiter to start its own line", () => {
      expect(countNoteSize("---\nfoo ---\nbar\n").words).toBe(4);
    });
  });

  describe("characters", () => {
    it("counts the stripped length including whitespace", () => {
      expect(countNoteSize("a b").characters).toBe(3);
    });
  });
});
