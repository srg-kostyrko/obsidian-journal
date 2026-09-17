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
  blank: "  ",
  link: "[[Note]]",
  tag: "#happy",
  mood: "happy",
  date: "2026-09-17",
  comma: "a, b",
  bracket: "a]",
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

    it("quotes only the value in a list entry that is itself a mapping", () => {
      const frontmatter = "links:\n  - name: {{colon}}\n    url: x\n";
      expect(rendered(frontmatter)).toBe('links:\n  - name: "rough: day"\n    url: x\n');
      const parsed = read(frontmatter);
      expect(parsed.links).toEqual([{ name: "rough: day", url: "x" }]);
    });

    it("writes a multi-line value under a list entry's own key as a literal block", () => {
      const frontmatter = "items:\n  - k: {{answer}}\n";
      expect(rendered(frontmatter)).toBe("items:\n  - k: |-\n      a\n      b\n\n      c\n");
      const parsed = read(frontmatter);
      expect(parsed.items).toEqual([{ k: "a\nb\n\nc" }]);
    });

    it("writes a multi-line value under a nested list entry's own dash as a literal block", () => {
      const frontmatter = "items:\n  - - {{answer}}\n  - x\n";
      expect(rendered(frontmatter)).toBe("items:\n  - - |-\n      a\n      b\n\n      c\n  - x\n");
      const parsed = read(frontmatter);
      expect(parsed.items).toEqual([["a\nb\n\nc"], "x"]);
    });

    it.each([
      ["double-quoted", '"display: name"', "display: name"],
      ["single-quoted", "'k: x'", "k: x"],
    ])("keeps a list entry with a %s key as a mapping", (_label, key, name) => {
      const frontmatter = `items:\n  - ${key}: {{mood}}\n`;
      expect(rendered(frontmatter)).toBe(`items:\n  - ${key}: happy\n`);
      expect(read(frontmatter).items).toEqual([{ [name]: "happy" }]);
    });

    it("quotes only the value under a quoted key in a list entry", () => {
      const frontmatter = 'items:\n  - "display: name": {{colon}}\n';
      expect(rendered(frontmatter)).toBe('items:\n  - "display: name": "rough: day"\n');
      expect(read(frontmatter).items).toEqual([{ "display: name": "rough: day" }]);
    });

    it("writes a multi-line value under a quoted key in a list entry as a literal block", () => {
      const frontmatter = 'items:\n  - "k: x": {{answer}}\n';
      expect(rendered(frontmatter)).toBe('items:\n  - "k: x": |-\n      a\n      b\n\n      c\n');
      expect(read(frontmatter).items).toEqual([{ "k: x": "a\nb\n\nc" }]);
    });

    it.each([
      ["a double-quoted key", '"quoted: key"', "quoted: key"],
      ["a double-quoted key with an escaped quote", String.raw`"say \"hi\": x"`, 'say "hi": x'],
      ["a single-quoted key with a doubled quote", "'it''s: x'", "it's: x"],
    ])("quotes only the value under %s", (_label, key, name) => {
      expect(rendered(`${key}: {{mood}}\n`)).toBe(`${key}: happy\n`);
      expect(rendered(`${key}: {{colon}}\n`)).toBe(`${key}: "rough: day"\n`);
      expect(read(`${key}: {{colon}}\n`)).toEqual({ [name]: "rough: day" });
    });

    it("recognizes a block header under a quoted key, leaving its body literal", () => {
      const frontmatter = '"k: x": |\n  a: {{colon}}\n';
      expect(rendered(frontmatter)).toBe('"k: x": |\n  a: rough: day\n');
      expect(read(frontmatter)).toEqual({ "k: x": "a: rough: day\n" });
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

    it.each(["-", "[", "{", "*", "&", "!", "%", "@", "`", "|", ">", "?", "#"])(
      "reads back a value starting with %s as written",
      (start) => {
        const frontmatter = "title: {{v}}\n";
        const text = renderFrontmatter(frontmatter, () => `${start} value`, "\n");
        expect((parseYaml(text) as Record<string, unknown>).title).toBe(`${start} value`);
      },
    );

    it("quotes a value that would otherwise read back as a dropped comment", () => {
      expect(read("mood: {{tag}}\n").mood).toBe("#happy");
    });

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

  describe("a value inside a flow collection", () => {
    it("keeps an item that reads back as written byte for byte", () => {
      expect(rendered("tags: [journal, {{mood}}]\n")).toBe("tags: [journal, happy]\n");
      expect(read("tags: [journal, {{mood}}]\n").tags).toEqual(["journal", "happy"]);
    });

    it.each([
      ["a colon and space, which would turn it into a mapping", "colon", "rough: day"],
      ["a space and hash, which would cut the collection short", "hash", "great #win"],
      ["a comma, which would split it in two", "comma", "a, b"],
      ["a closing bracket", "bracket", "a]"],
    ])("quotes a sequence item containing %s", (_label, name, expected) => {
      const frontmatter = `tags: [journal, {{${name}}}]\n`;
      expect(rendered(frontmatter)).toBe(`tags: [journal, ${JSON.stringify(expected)}]\n`);
      expect(read(frontmatter).tags).toEqual(["journal", expected]);
    });

    it("quotes a mapping value that would not read back", () => {
      expect(rendered("meta: {a: {{colon}}}\n")).toBe('meta: {a: "rough: day"}\n');
      expect(read("meta: {a: {{colon}}}\n").meta).toEqual({ a: "rough: day" });
    });

    it("escapes each entry of a flow mapping on its own", () => {
      const frontmatter = "meta: {a: {{colon}}, b: {{mood}}}\n";
      expect(rendered(frontmatter)).toBe('meta: {a: "rough: day", b: happy}\n');
      expect(read(frontmatter).meta).toEqual({ a: "rough: day", b: "happy" });
    });

    it("escapes only the value of a single-pair mapping inside a sequence", () => {
      const frontmatter = "links: [x, name: {{colon}}]\n";
      expect(rendered(frontmatter)).toBe('links: [x, name: "rough: day"]\n');
      expect(read(frontmatter).links).toEqual(["x", { name: "rough: day" }]);
    });

    it("renders a variable in a flow mapping's key as written, escaping its value", () => {
      const frontmatter = "meta: {k{{plain}}: {{colon}}}\n";
      expect(rendered(frontmatter)).toBe('meta: {kDaily: "rough: day"}\n');
      expect(read(frontmatter).meta).toEqual({ kDaily: "rough: day" });
    });

    it("escapes an item the author quoted for its own quote style", () => {
      expect(rendered('tags: ["{{quote}}", x]\n')).toBe('tags: ["say \\"hi\\"", x]\n');
      expect(read('tags: ["{{quote}}", x]\n').tags).toEqual(['say "hi"', "x"]);
      expect(rendered("tags: ['{{apos}}', x]\n")).toBe("tags: ['it''s', x]\n");
      expect(read("tags: ['{{apos}}', x]\n").tags).toEqual(["it's", "x"]);
    });

    it("writes a multi-line item as one double-quoted string", () => {
      expect(rendered("tags: [journal, {{answer}}]\n")).toBe('tags: [journal, "a\\nb\\n\\nc"]\n');
      expect(read("tags: [journal, {{answer}}]\n").tags).toEqual(["journal", "a\nb\n\nc"]);
    });

    it("escapes inside a nested collection", () => {
      expect(rendered("tags: [a, [{{colon}}]]\n")).toBe('tags: [a, ["rough: day"]]\n');
      expect(read("tags: [a, [{{colon}}]]\n").tags).toEqual(["a", ["rough: day"]]);
      expect(read("meta: {a: [x, {{hash}}]}\n").meta).toEqual({ a: ["x", "great #win"] });
    });

    it("keeps typed items as written", () => {
      expect(rendered("values: [{{num}}, {{bool}}, {{list}}]\n")).toBe("values: [42, true, [a, b]]\n");
      expect(read("values: [{{num}}, {{bool}}, {{list}}]\n").values).toEqual([42, true, ["a", "b"]]);
    });

    it("leaves an empty last sequence item as renderString would, dropping it", () => {
      expect(rendered("tags: [journal, {{empty}}]\n")).toBe("tags: [journal, ]\n");
      expect(read("tags: [journal, {{empty}}]\n").tags).toEqual(["journal"]);
    });

    it("leaves an empty first sequence item as renderString would", () => {
      expect(rendered("tags: [{{empty}}, journal]\n")).toBe("tags: [, journal]\n");
    });

    it("leaves a whitespace-only item as renderString would", () => {
      expect(rendered("tags: [journal, {{blank}}]\n")).toBe("tags: [journal,   ]\n");
      expect(read("tags: [journal, {{blank}}]\n").tags).toEqual(["journal"]);
      expect(rendered("meta: {a: {{blank}}}\n")).toBe("meta: {a:   }\n");
      expect(read("meta: {a: {{blank}}}\n").meta).toEqual({ a: null });
    });

    it("keeps an empty flow mapping value as written", () => {
      expect(rendered("meta: {a: {{empty}}}\n")).toBe("meta: {a: }\n");
      expect(read("meta: {a: {{empty}}}\n").meta).toEqual({ a: null });
    });

    it("escapes a flow collection that is a list entry", () => {
      const frontmatter = "items:\n  - [x, {{colon}}]\n";
      expect(rendered(frontmatter)).toBe('items:\n  - [x, "rough: day"]\n');
      expect(read(frontmatter).items).toEqual([["x", "rough: day"]]);
    });

    it("keeps a comment after the collection outside it", () => {
      const frontmatter = "tags: [journal, {{colon}}] # c\n";
      expect(rendered(frontmatter)).toBe('tags: [journal, "rough: day"] # c\n');
      expect(read(frontmatter).tags).toEqual(["journal", "rough: day"]);
    });

    it("keeps a # inside the author's quotes in a collection as part of the item", () => {
      const frontmatter = 'tags: ["a #b", {{colon}}] # c\n';
      expect(rendered(frontmatter)).toBe('tags: ["a #b", "rough: day"] # c\n');
      expect(read(frontmatter).tags).toEqual(["a #b", "rough: day"]);
    });

    it.each([
      ["empty", "", { x: 1, mood: null }],
      ["link", "[[Note]]", { x: 1, mood: [["Note"]] }],
    ])("leaves the lines of a collection spanning several lines as renderString would (%s)", (name, text, meta) => {
      const frontmatter = `meta: {x: 1,\n  mood: {{${name}}}}\nb: {{colon}}\n`;
      expect(rendered(frontmatter)).toBe(`meta: {x: 1,\n  mood: ${text}}\nb: "rough: day"\n`);
      expect(read(frontmatter)).toEqual({ meta, b: "rough: day" });
    });

    it.each([
      ["empty", "", { mood: null, x: 1 }],
      ["link", "[[Note]]", { mood: [["Note"]], x: 1 }],
    ])("leaves a collection whose brackets sit on their own lines as renderString would (%s)", (name, text, meta) => {
      const frontmatter = `meta: {\n  mood: {{${name}}},\n  x: 1\n}\nb: {{colon}}\n`;
      expect(rendered(frontmatter)).toBe(`meta: {\n  mood: ${text},\n  x: 1\n}\nb: "rough: day"\n`);
      expect(read(frontmatter)).toEqual({ meta, b: "rough: day" });
    });

    it.each([
      ["empty", "", null],
      ["link", "[[Note]]", [["Note"]]],
    ])("tracks a collection opened on a line holding a Templater command (%s)", (name, text, b) => {
      const frontmatter = `m: {t: <% tp.date.now() %>,\n  b: {{${name}}}}\n`;
      expect(rendered(frontmatter)).toBe(`m: {t: <% tp.date.now() %>,\n  b: ${text}}\n`);
      expect(read(frontmatter)).toEqual({ m: { t: "<% tp.date.now() %>", b } });
      const sequence = `m: [<% tp.x %>,\n  b: {{${name}}}]\n`;
      expect(rendered(sequence)).toBe(`m: [<% tp.x %>,\n  b: ${text}]\n`);
      expect(read(sequence)).toEqual({ m: ["<% tp.x %>", { b }] });
    });

    it("resumes escaping after a collection closed on a line holding a Templater command", () => {
      const frontmatter = "t: [a,\n  <% tp.x %>]\nafter: {{colon}}\n";
      expect(rendered(frontmatter)).toBe('t: [a,\n  <% tp.x %>]\nafter: "rough: day"\n');
      expect(read(frontmatter)).toEqual({ t: ["a", "<% tp.x %>"], after: "rough: day" });
    });

    it("leaves the opening line of a collection spanning several lines as renderString would", () => {
      expect(rendered("meta: {a: {{colon}},\n  x: 1}\n")).toBe("meta: {a: rough: day,\n  x: 1}\n");
    });

    it.each([
      ["a double-quoted", '"a"'],
      ["a single-quoted", "'a'"],
    ])("escapes only the value of %s key followed straight by a colon", (_label, key) => {
      expect(rendered(`x: [${key}:{{mood}}]\n`)).toBe(`x: [${key}:happy]\n`);
      expect(read(`x: [${key}:{{mood}}]\n`).x).toEqual([{ a: "happy" }]);
      expect(read(`x: [${key}:{{num}}]\n`).x).toEqual([{ a: 42 }]);
      expect(rendered(`x: [${key}:{{empty}}]\n`)).toBe(`x: [${key}:]\n`);
      expect(read(`x: [${key}:{{empty}}]\n`).x).toEqual([{ a: null }]);
      expect(rendered(`x: [${key}:{{colon}}]\n`)).toBe(`x: [${key}:"rough: day"]\n`);
      expect(read(`x: [${key}:{{colon}}]\n`).x).toEqual([{ a: "rough: day" }]);
    });

    it("leaves an explicit key indicator as renderString would", () => {
      expect(rendered("x: [? {{mood}}]\n")).toBe("x: [? happy]\n");
      expect(read("x: [? {{mood}}]\n").x).toEqual([{ happy: null }]);
    });

    it("leaves a tag as renderString would", () => {
      expect(rendered("x: [!!str {{num}}]\n")).toBe("x: [!!str 42]\n");
      expect(read("x: [!!str {{num}}]\n").x).toEqual(["42"]);
    });

    it("leaves an anchor as renderString would", () => {
      expect(rendered("x: [&a {{mood}}, *a]\n")).toBe("x: [&a happy, *a]\n");
      expect(read("x: [&a {{mood}}, *a]\n").x).toEqual(["happy", "happy"]);
    });

    it("leaves an unclosed collection as renderString would", () => {
      expect(rendered("tags: [journal, {{colon}}\n")).toBe("tags: [journal, rough: day\n");
    });

    it.each([
      ["a tag", '!!str "a #b"'],
      ["an anchor", '&x "a #b"'],
      ["a tag and an anchor", '!!str &x "a #b"'],
      ["a single-quoted tagged scalar", "!!str 'a #b'"],
    ])("still escapes a later item after %s before a quoted scalar holding ` #`", (_label, item) => {
      const frontmatter = `tags: [${item}, {{colon}}]\n`;
      expect(rendered(frontmatter)).toBe(`tags: [${item}, "rough: day"]\n`);
      expect(read(frontmatter).tags).toEqual(["a #b", "rough: day"]);
    });

    it("still escapes a later value in a mapping after a tagged quoted scalar holding ` #`", () => {
      const frontmatter = 'meta: {k: !!str "a #b", v: {{colon}}}\n';
      expect(rendered(frontmatter)).toBe('meta: {k: !!str "a #b", v: "rough: day"}\n');
      expect(read(frontmatter).meta).toEqual({ k: "a #b", v: "rough: day" });
    });

    it("keeps escaping the lines after a multi-line collection whose tagged quoted item holds a bracket", () => {
      const frontmatter = 'tags: [\n  !!str "a [b",\n  x\n]\nafter: {{colon}}\n';
      expect(rendered(frontmatter)).toBe('tags: [\n  !!str "a [b",\n  x\n]\nafter: "rough: day"\n');
      expect(read(frontmatter)).toEqual({ tags: ["a [b", "x"], after: "rough: day" });
    });

    it("does not read a quote inside a plain word as opening a scalar", () => {
      expect(rendered('tags: [!tag"a, {{colon}}]\n')).toBe('tags: [!tag"a, "rough: day"]\n');
    });
  });

  describe("a value followed by a comment in the template", () => {
    it("keeps a plain value apart from the comment after it", () => {
      expect(rendered("mood: {{mood}} # how I feel\n")).toBe("mood: happy # how I feel\n");
      expect(read("mood: {{mood}} # how I feel\n").mood).toBe("happy");
    });

    it("still quotes a value that needs it, leaving the comment outside the quotes", () => {
      expect(rendered("title: {{colon}}   # c\n")).toBe('title: "rough: day"   # c\n');
      expect(read("title: {{colon}}   # c\n").title).toBe("rough: day");
    });

    it("recognizes the author's double quotes before a comment", () => {
      expect(rendered('key: "{{mood}}" # c\n')).toBe('key: "happy" # c\n');
      expect(read('key: "{{mood}}" # c\n').key).toBe("happy");
    });

    it("recognizes the author's single quotes before a comment", () => {
      expect(rendered("key: 'it''s {{mood}}' # c\n")).toBe("key: 'it''s happy' # c\n");
      expect(read("key: 'it''s {{mood}}' # c\n").key).toBe("it's happy");
    });

    it("keeps a # inside the author's quotes as part of the value", () => {
      expect(read('key: "a #b {{mood}}" # c\n').key).toBe("a #b happy");
    });

    it("writes a multi-line value as a block with the comment on its header", () => {
      expect(rendered("summary: {{answer}} # c\n")).toBe("summary: |- # c\n  a\n  b\n\n  c\n");
      expect(read("summary: {{answer}} # c\n").summary).toBe("a\nb\n\nc");
    });

    it("quotes a substituted value containing a space and hash when the template has no comment", () => {
      expect(rendered("title: {{hash}}\n")).toBe('title: "great #win"\n');
      expect(read("title: {{hash}}\n").title).toBe("great #win");
    });

    it("recognizes a block header whose indicator is followed by a comment", () => {
      const frontmatter = "summary: | # c\n  k: {{colon}}\n";
      expect(rendered(frontmatter)).toBe("summary: | # c\n  k: rough: day\n");
      expect(read(frontmatter).summary).toBe("k: rough: day\n");
    });

    it("recognizes a list entry's folded block header followed by a comment", () => {
      const frontmatter = "items:\n  - > # c\n    k: {{colon}}\n";
      expect(rendered(frontmatter)).toBe("items:\n  - > # c\n    k: rough: day\n");
      expect(read(frontmatter).items).toEqual(["k: rough: day\n"]);
    });
  });

  describe("other lines", () => {
    it("continues a value inside a block the template opens with indentation only", () => {
      expect(rendered("summary: |\n  > {{answer}}\n")).toBe("summary: |\n  > a\n  b\n\n  c\n");
    });

    it("leaves a template-authored comment as renderString would, not as a quoted value", () => {
      const frontmatter = "tags: # {{plain}}\n  - a\n";
      expect(rendered(frontmatter)).toBe("tags: # Daily\n  - a\n");
      expect(read(frontmatter)).toEqual({ tags: ["a"] });
    });

    it("leaves a line carrying a Templater command as renderString would", () => {
      expect(rendered('title: {{date}} <% tp.system.prompt("Mood: ") %>\n')).toBe(
        'title: 2026-09-17 <% tp.system.prompt("Mood: ") %>\n',
      );
    });

    it("leaves every line of a multi-line Templater command as renderString would", () => {
      const frontmatter = '<%*\ntR += "mood: {{colon}}";\n%>\n';
      expect(rendered(frontmatter)).toBe('<%*\ntR += "mood: rough: day";\n%>\n');
    });

    it("resumes escaping only after a multi-line command closes, not on its opening line", () => {
      const frontmatter = '<%*\ntR += "mood: {{colon}}";\n%>\ntitle: {{colon}}\n';
      expect(rendered(frontmatter)).toBe('<%*\ntR += "mood: rough: day";\n%>\ntitle: "rough: day"\n');
    });

    it("resumes escaping on the line after a command that opens and closes on one line", () => {
      const frontmatter = "a: <% x %> {{colon}}\nb: {{colon}}\n";
      expect(rendered(frontmatter)).toBe('a: <% x %> rough: day\nb: "rough: day"\n');
    });

    it("keeps a block-scalar continuation indented when its line also carries a self-contained command", () => {
      const frontmatter = "body: |\n  start <% x %> {{answer}}\nx: 1\n";
      expect(rendered(frontmatter)).toBe("body: |\n  start <% x %> a\n  b\n\n  c\nx: 1\n");
      expect(read(frontmatter)).toEqual({ body: "start <% x %> a\nb\n\nc\n", x: 1 });
    });

    it("keeps escaping off a plain block-scalar line that follows a self-contained command line", () => {
      const frontmatter = "body: |\n  <% tp.date.now() %>\n  mood: {{colon}}\n";
      expect(rendered(frontmatter)).toBe("body: |\n  <% tp.date.now() %>\n  mood: rough: day\n");
      expect(read(frontmatter)).toEqual({ body: "<% tp.date.now() %>\nmood: rough: day\n" });
    });

    it("indents a multi-line value on a block-scalar line that follows a self-contained command line", () => {
      const frontmatter = "body: |\n  <% tp.date.now() %>\n  {{answer}}\n";
      expect(rendered(frontmatter)).toBe("body: |\n  <% tp.date.now() %>\n  a\n  b\n\n  c\n");
      expect(read(frontmatter)).toEqual({ body: "<% tp.date.now() %>\na\nb\n\nc\n" });
    });

    it("keeps a command open past the block-scalar body it opened in, onto a following top-level line", () => {
      const frontmatter = "body: |\n  <%*\ntitle: {{colon}}\n";
      expect(rendered(frontmatter)).toBe("body: |\n  <%*\ntitle: rough: day\n");
    });

    it("leaves a value in key position as renderString would", () => {
      expect(rendered("{{plain}}: 1\n")).toBe("Daily: 1\n");
    });

    it("renders a variable inside a key that also has literal text", () => {
      expect(rendered("note_{{plain}}: 1\n")).toBe("note_Daily: 1\n");
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
