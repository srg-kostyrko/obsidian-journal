import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { markdownFiles, scanMarkdown } from "./docs-markdown.mjs";

// One word per line: what a consumer would do with it.
function kinds(text) {
  return scanMarkdown(text).lines.map(({ fenced, inVPre, vPreMarker }) => {
    if (fenced) return "fence";
    if (vPreMarker) return "marker";
    return inVPre ? "vpre" : "text";
  });
}

describe("scanMarkdown", () => {
  describe("v-pre containers", () => {
    it("marks a column-0 v-pre", () => {
      expect(kinds("# Title\n\n::: v-pre\n`{{date}}`\n:::\n\nafter")).toEqual([
        "text",
        "text",
        "marker",
        "vpre",
        "marker",
        "text",
        "text",
      ]);
    });

    it("marks a v-pre indented inside a list item", () => {
      const text = "1. Step.\n\n   ::: v-pre\n   The `{{date}}` variable.\n   :::\n\n2. Next.";
      expect(kinds(text)).toEqual(["text", "text", "marker", "vpre", "marker", "text", "text"]);
    });

    it("marks a tab-indented v-pre", () => {
      expect(kinds("\t::: v-pre\n\t{{x}}\n\t:::")).toEqual(["marker", "vpre", "marker"]);
    });

    it("takes the first token as the name, so a titled v-pre is a v-pre", () => {
      expect(kinds("::: v-pre Some title\n{{x}}\n:::")).toEqual(["marker", "vpre", "marker"]);
    });

    it("keeps a tip nested inside a longer v-pre protected without marking the tip's own lines", () => {
      const text = ":::: v-pre\n{{a}}\n::: tip\n{{b}}\n:::\n{{c}}\n::::\n{{d}}";
      expect(kinds(text)).toEqual(["marker", "vpre", "vpre", "vpre", "vpre", "vpre", "marker", "text"]);
    });

    it("ends a v-pre at the first closer it is long enough for, even one meant for a same-length nested tip", () => {
      const text = "::: v-pre\n{{a}}\n::: tip\n{{b}}\n:::\n{{c}}\n:::\n{{d}}";
      expect(kinds(text)).toEqual(["marker", "vpre", "vpre", "vpre", "marker", "text", "text", "text"]);
      expect(scanMarkdown(text).unclosedVPre).toBe(false);
    });

    it("closes a v-pre nested in a tip when the tip's own closer ends it", () => {
      const text = "::: tip\n:::: v-pre\n{{x}}\n:::\n{{y}}";
      expect(kinds(text)).toEqual(["text", "marker", "vpre", "vpre", "text"]);
      expect(scanMarkdown(text).unclosedVPre).toBe(false);
    });

    it("does not protect a tip that is not inside a v-pre", () => {
      expect(kinds("::: tip\n{{x}}\n:::")).toEqual(["text", "text", "text"]);
    });

    it("closes a four-colon v-pre only on four colons, keeping an inner ::: as content", () => {
      const text = ":::: v-pre\n{{x}}\n:::\n::::\n{{y}}";
      expect(kinds(text)).toEqual(["marker", "vpre", "vpre", "marker", "text"]);
      expect(scanMarkdown(text).unclosedVPre).toBe(false);
    });

    it("treats a closer on an empty stack as plain text", () => {
      const { lines, unclosedVPre } = scanMarkdown(":::\n{{x}}");
      expect(kinds(":::\n{{x}}")).toEqual(["text", "text"]);
      expect(lines[0].vPreMarker).toBe(false);
      expect(unclosedVPre).toBe(false);
    });

    it("never opens a container on a bare colon run, even one too short to close the v-pre", () => {
      const text = "::::: v-pre\n::::\n{{x}}\n:::::\n{{y}}";
      expect(kinds(text)).toEqual(["marker", "vpre", "vpre", "marker", "text"]);
      expect(scanMarkdown(text).unclosedVPre).toBe(false);
    });

    it("reports an unclosed column-0 v-pre", () => {
      const { unclosedVPre } = scanMarkdown("::: v-pre\n{{x}}\nno closer");
      expect(unclosedVPre).toBe(true);
    });

    it("reports an unclosed indented v-pre", () => {
      const { lines, unclosedVPre } = scanMarkdown("- item\n\n  ::: v-pre\n  {{x}}\n\nnext");
      expect(unclosedVPre).toBe(true);
      expect(lines.at(-1).inVPre).toBe(true);
    });

    it("reports a closed v-pre as closed", () => {
      expect(scanMarkdown("::: v-pre\n{{x}}\n:::").unclosedVPre).toBe(false);
    });
  });

  describe("fences", () => {
    it("keeps container markers inside a tilde fence as code", () => {
      const text = "~~~\n::: v-pre\n{{date}}\n:::\n~~~\n{{after}}";
      expect(kinds(text)).toEqual(["fence", "fence", "fence", "fence", "fence", "text"]);
      expect(scanMarkdown(text).unclosedVPre).toBe(false);
    });

    it("closes a tilde fence only with tildes", () => {
      expect(kinds("~~~\n```\ncode\n~~~\ntext")).toEqual(["fence", "fence", "fence", "fence", "text"]);
    });

    it("keeps a three-backtick line and a v-pre inside a four-backtick fence as code", () => {
      const text = "````md\n```\n::: v-pre\n{{x}}\n:::\n```\n````\n{{after}}";
      expect(kinds(text)).toEqual(["fence", "fence", "fence", "fence", "fence", "fence", "fence", "text"]);
    });

    it("recognizes a fence indented up to three spaces", () => {
      expect(kinds("- item\n\n   ```\n   {{x}}\n   ```\n\n{{y}}")).toEqual([
        "text",
        "text",
        "fence",
        "fence",
        "fence",
        "text",
        "text",
      ]);
    });

    it("does not let a fence disturb an enclosing v-pre", () => {
      const text = "::: v-pre\n```\n:::\n```\n{{x}}\n:::";
      expect(kinds(text)).toEqual(["marker", "fence", "fence", "fence", "vpre", "marker"]);
    });
  });

  describe("line endings", () => {
    it("classifies CRLF the same as LF and yields lines without the carriage return", () => {
      const lf = "# Title\n\n::: v-pre\n`{{date}}`\n:::\n\n```\n:::\n```\n";
      const crlf = lf.replaceAll("\n", "\r\n");
      expect(kinds(crlf)).toEqual(kinds(lf));
      expect(scanMarkdown(crlf).lines.map((entry) => entry.line)).toEqual(
        scanMarkdown(lf).lines.map((entry) => entry.line),
      );
      expect(scanMarkdown(crlf).lines.some((entry) => entry.line.includes("\r"))).toBe(false);
    });

    it("numbers lines from one against the original file", () => {
      expect(scanMarkdown("a\r\nb\r\nc").lines.map((entry) => entry.lineno)).toEqual([1, 2, 3]);
    });
  });
});

describe("markdownFiles", () => {
  it("lists every page in sorted order, skipping dot-directories and public/", () => {
    const root = mkdtempSync(path.join(tmpdir(), "docs-markdown-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    for (const dir of [".vitepress", "public", "reference", "guides"]) mkdirSync(path.join(root, dir));
    for (const file of [
      "index.md",
      "zeta.md",
      "alpha.md",
      "notes.txt",
      "reference/glossary.md",
      "guides/setup.md",
      ".vitepress/theme.md",
      "public/robots.md",
    ]) {
      writeFileSync(path.join(root, file), "");
    }

    expect(markdownFiles(root).map((file) => path.relative(root, file))).toEqual([
      "alpha.md",
      "guides/setup.md",
      "index.md",
      "reference/glossary.md",
      "zeta.md",
    ]);
  });
});
