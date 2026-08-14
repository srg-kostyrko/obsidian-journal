import { describe, expect, it } from "vitest";

import { tokenize } from "./grammar";

describe("tokenize", () => {
  describe("literals", () => {
    it("returns a single literal token for plain text", () => {
      expect(tokenize("hello world")).toEqual([{ kind: "literal", text: "hello world" }]);
    });

    it("returns empty stream for empty template", () => {
      expect(tokenize("")).toEqual([]);
    });
  });

  describe("variable tokens", () => {
    it("parses a bare variable", () => {
      expect(tokenize("{{date}}")).toEqual([
        { kind: "variable", name: "date", modifiers: [], format: undefined, raw: "{{date}}" },
      ]);
    });

    it("allows whitespace around the name", () => {
      const tokens = tokenize("{{ date }}");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ kind: "variable", name: "date" });
    });

    it("parses a format slot", () => {
      const tokens = tokenize("{{date:YYYY-MM-DD}}");
      expect(tokens[0]).toMatchObject({ kind: "variable", name: "date", format: "YYYY-MM-DD" });
    });

    it("parses arithmetic modifier", () => {
      const tokens = tokenize("{{date+1w}}");
      expect(tokens[0]).toMatchObject({
        kind: "variable",
        name: "date",
        modifiers: [{ kind: "shift", sign: 1, amount: 1, unit: "w" }],
      });
    });

    it("parses negative arithmetic modifier", () => {
      const tokens = tokenize("{{date-2d}}");
      expect(tokens[0]).toMatchObject({
        modifiers: [{ kind: "shift", sign: -1, amount: 2, unit: "d" }],
      });
    });

    it("parses boundary modifier", () => {
      const tokens = tokenize("{{date<startOf=week>}}");
      expect(tokens[0]).toMatchObject({
        modifiers: [{ kind: "boundary", direction: "start", unit: "week" }],
      });
    });

    it("parses combined arithmetic + boundary + format", () => {
      const tokens = tokenize("{{date+1w<endOf=month>:YYYY-MM-DD}}");
      expect(tokens[0]).toMatchObject({
        kind: "variable",
        name: "date",
        modifiers: [
          { kind: "shift", sign: 1, amount: 1, unit: "w" },
          { kind: "boundary", direction: "end", unit: "month" },
        ],
        format: "YYYY-MM-DD",
      });
    });

    it("preserves colons inside the format slot", () => {
      const tokens = tokenize("{{time:HH:mm:ss}}");
      expect(tokens[0]).toMatchObject({ format: "HH:mm:ss" });
    });
  });

  describe("function tokens", () => {
    it("parses a function with single argument", () => {
      const tokens = tokenize("{{journal_link(Daily)}}");
      expect(tokens[0]).toMatchObject({
        kind: "function",
        name: "journal_link",
        arg: "Daily",
        raw: "{{journal_link(Daily)}}",
      });
    });

    it("trims whitespace inside parens", () => {
      const tokens = tokenize("{{journal_link( My Journal )}}");
      expect(tokens[0]).toMatchObject({ arg: "My Journal" });
    });

    it("supports modifiers on function tokens", () => {
      const tokens = tokenize("{{journal_link(Weekly)+1w:YYYY}}");
      expect(tokens[0]).toMatchObject({
        kind: "function",
        name: "journal_link",
        arg: "Weekly",
        modifiers: [{ kind: "shift", sign: 1, amount: 1, unit: "w" }],
        format: "YYYY",
      });
    });
  });

  describe("mixed templates", () => {
    it("interleaves literals and variables", () => {
      const tokens = tokenize("prefix-{{date}}-suffix");
      expect(tokens).toEqual([
        { kind: "literal", text: "prefix-" },
        { kind: "variable", name: "date", modifiers: [], format: undefined, raw: "{{date}}" },
        { kind: "literal", text: "-suffix" },
      ]);
    });
  });

  describe("malformed tokens", () => {
    it("treats an unclosed brace block as a literal up to end of input", () => {
      const tokens = tokenize("hello {{date");
      expect(tokens).toEqual([{ kind: "literal", text: "hello {{date" }]);
    });

    it("treats a brace block with illegal characters as a literal", () => {
      const tokens = tokenize("{{!!!}}");
      expect(tokens).toEqual([{ kind: "literal", text: "{{!!!}}" }]);
    });

    it("treats a brace block with unparsable modifier as a literal", () => {
      const tokens = tokenize("{{date+xx}}");
      expect(tokens).toEqual([{ kind: "literal", text: "{{date+xx}}" }]);
    });
  });
});
