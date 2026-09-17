import { parseYaml } from "obsidian";
import { describe, expect, it } from "vitest";

import { renderFrontmatter } from "./yaml-value";

import type { RenderToken } from "./types";

const values: Record<string, string> = {
  answer: "a\nb\n\nc",
  colon: "rough: day",
  hash: "great #win",
  num: "42",
  bool: "true",
  list: "[a, b]",
  empty: "",
  quote: 'say "hi"',
  apos: "it's",
  yes: "yes",
  indented: "  lead\nnext",
  dashes: "a\n---\nb",
  plain: "Daily",
  lead: " spaced",
};

const render: RenderToken = (token) => (token.kind === "literal" ? token.text : (values[token.name] ?? token.raw));

function rendered(frontmatter: string): string {
  return renderFrontmatter(frontmatter, render, "\n");
}

function read(frontmatter: string): Record<string, unknown> {
  return parseYaml(rendered(frontmatter)) as Record<string, unknown>;
}

describe("renderFrontmatter", () => {
  describe("a value that is the whole of its line", () => {
    it("writes a multi-line value as a literal block", () => {
      expect(rendered("summary: {{answer}}\n")).toBe("summary: |-\n  a\n  b\n\n  c\n");
      expect(read("summary: {{answer}}\n").summary).toBe("a\nb\n\nc");
    });

    it("writes a multi-line list entry as a literal block under the entry", () => {
      expect(rendered("items:\n  - {{answer}}\n")).toBe("items:\n  - |-\n    a\n    b\n\n    c\n");
      expect(read("items:\n  - {{answer}}\n").items).toEqual(["a\nb\n\nc"]);
    });

    it("keeps a first line's own indentation with an explicit indentation indicator", () => {
      expect(read("summary: {{indented}}\n").summary).toBe("  lead\nnext");
    });

    it("keeps a value containing a --- line inside the block", () => {
      expect(read("summary: {{dashes}}\n").summary).toBe("a\n---\nb");
    });

    it.each([
      ["a colon and space", "colon", "rough: day"],
      ["a space and hash", "hash", "great #win"],
      ["a leading space", "lead", " spaced"],
    ])("quotes a value containing %s", (_label, name, expected) => {
      expect(rendered(`title: {{${name}}}\n`)).toBe(`title: ${JSON.stringify(expected)}\n`);
      expect(read(`title: {{${name}}}\n`).title).toBe(expected);
    });

    it("keeps a value with quotes inside it as written, since it reads back unchanged", () => {
      expect(rendered("title: {{quote}}\n")).toBe('title: say "hi"\n');
      expect(read("title: {{quote}}\n").title).toBe('say "hi"');
    });

    it.each(["-", "[", "{", "*", "&", "!", "%", "@", "`", "|", ">", "?"])(
      "reads back a value starting with %s as written",
      (start) => {
        const frontmatter = "title: {{v}}\n";
        const text = renderFrontmatter(frontmatter, () => `${start} value`, "\n");
        expect((parseYaml(text) as Record<string, unknown>).title).toBe(`${start} value`);
      },
    );

    it.each([
      ["a number", "num", 42],
      ["a boolean", "bool", true],
      ["a list", "list", ["a", "b"]],
      ["an empty value", "empty", null],
      ["yes, a string under YAML 1.2", "yes", "yes"],
    ])("keeps %s exactly as written today", (_label, name, expected) => {
      expect(rendered(`value: {{${name}}}\n`)).toBe(`value: ${values[name]}\n`);
      expect(read(`value: {{${name}}}\n`).value).toEqual(expected);
    });
  });

  describe("a value inside a larger value", () => {
    it("quotes the whole value when it would not read back", () => {
      expect(rendered("title: Day {{colon}}\n")).toBe('title: "Day rough: day"\n');
    });

    it("leaves a value that reads back unchanged", () => {
      expect(rendered("title: Day {{plain}}\n")).toBe("title: Day Daily\n");
    });

    it("quotes a multi-line value as one string", () => {
      expect(read("title: Day {{answer}}\n").title).toBe("Day a\nb\n\nc");
    });

    it("escapes inside double quotes", () => {
      expect(rendered('summary: "Mood: {{quote}}"\n')).toBe('summary: "Mood: say \\"hi\\""\n');
      expect(read('summary: "Mood: {{answer}}"\n').summary).toBe("Mood: a\nb\n\nc");
    });

    it("escapes inside single quotes", () => {
      expect(rendered("summary: 'Mood: {{apos}}'\n")).toBe("summary: 'Mood: it''s'\n");
    });

    it("turns single quotes into double quotes for a multi-line value", () => {
      expect(read("summary: 'It''s {{answer}}'\n").summary).toBe("It's a\nb\n\nc");
    });
  });

  describe("other lines", () => {
    it("continues a value inside a block the template opens with indentation only", () => {
      expect(rendered("summary: |\n  > {{answer}}\n")).toBe("summary: |\n  > a\n  b\n\n  c\n");
    });

    it("leaves a flow collection as renderString would", () => {
      expect(rendered("meta: {a: {{colon}}}\n")).toBe("meta: {a: rough: day}\n");
    });

    it("leaves a value in key position as renderString would", () => {
      expect(rendered("{{plain}}: 1\n")).toBe("Daily: 1\n");
    });

    it("leaves lines without values untouched, including invalid ones", () => {
      expect(rendered("broken: [unclosed\ntitle: {{plain}}\n")).toBe("broken: [unclosed\ntitle: Daily\n");
    });

    it("writes CRLF when asked", () => {
      expect(renderFrontmatter("summary: {{answer}}\r\n", render, "\r\n")).toBe(
        "summary: |-\r\n  a\r\n  b\r\n\r\n  c\r\n",
      );
    });
  });
});
