import { describe, expect, it } from "vitest";

import { placeGroups } from "./placement";

const group = (heading: string | null, ...lines: string[]) => ({ heading, lines });

describe("placeGroups", () => {
  it("a group lands under the target heading with the same text as its source heading", () => {
    const target = "## Work\n- [ ] a\n\n## Tasks\n- [ ] b\n";
    expect(placeGroups(target, [group("Work", "- [ ] x")], "Tasks")).toBe(
      "## Work\n- [ ] a\n- [ ] x\n\n## Tasks\n- [ ] b\n",
    );
  });

  it("with no matching heading it lands under the configured target heading", () => {
    const target = "## Work\n- [ ] a\n\n## Tasks\n- [ ] b\n";
    expect(placeGroups(target, [group("Home", "- [ ] x")], "Tasks")).toBe(
      "## Work\n- [ ] a\n\n## Tasks\n- [ ] b\n- [ ] x\n",
    );
    expect(placeGroups(target, [group(null, "- [ ] x")], "Tasks")).toBe(
      "## Work\n- [ ] a\n\n## Tasks\n- [ ] b\n- [ ] x\n",
    );
  });

  it("with neither it is appended at the end", () => {
    expect(placeGroups("## Work\n- [ ] a\n", [group("Home", "- [ ] x")], "Tasks")).toBe("## Work\n- [ ] a\n- [ ] x\n");
    expect(placeGroups("## Work\n- [ ] a\n\n\n", [group(null, "- [ ] x")], "")).toBe("## Work\n- [ ] a\n- [ ] x\n\n\n");
  });

  it("a heading line inside a code fence or frontmatter is not a section", () => {
    const fenced = "```\n## Tasks\n```\n## Other\n- [ ] o\n";
    expect(placeGroups(fenced, [group("Tasks", "- [ ] x")], "")).toBe(`${fenced}- [ ] x\n`);
    const tilde = "~~~\n## Tasks\n~~~\n## Other\n- [ ] o\n";
    expect(placeGroups(tilde, [group(null, "- [ ] x")], "Tasks")).toBe(`${tilde}- [ ] x\n`);
    const front = "---\n## Tasks\ntitle: t\n---\n## Other\n- [ ] o\n";
    expect(placeGroups(front, [group("Tasks", "- [ ] x")], "")).toBe(`${front}- [ ] x\n`);
  });

  it("a heading line inside an HTML or Obsidian comment is not a section", () => {
    const html = "<!--\n## Tasks\nhidden\n## Draft\n-->\n## Other\n- [ ] o\n";
    expect(placeGroups(html, [group("Tasks", "- [ ] x")], "")).toBe(`${html}- [ ] x\n`);
    const obsidian = "%%\n## Tasks\n%%\n## Other\n- [ ] o\n";
    expect(placeGroups(obsidian, [group("Tasks", "- [ ] x")], "")).toBe(`${obsidian}- [ ] x\n`);
    const opensMidLine = "draft <!-- start\n## Tasks\nend -->\n## Other\n- [ ] o\n";
    expect(placeGroups(opensMidLine, [group(null, "- [ ] x")], "Tasks")).toBe(`${opensMidLine}- [ ] x\n`);
  });

  it("a comment closed on its own line leaves the following heading real", () => {
    const target = "%% note %%\n<!-- aside -->\n## Tasks\n- [ ] a\n## Other\n- [ ] o\n";
    expect(placeGroups(target, [group("Tasks", "- [ ] x")], "")).toBe(
      "%% note %%\n<!-- aside -->\n## Tasks\n- [ ] a\n- [ ] x\n## Other\n- [ ] o\n",
    );
    const fenced = "```\n%%\n```\n## Tasks\n- [ ] a\n## Other\n";
    expect(placeGroups(fenced, [group("Tasks", "- [ ] x")], "")).toBe(
      "```\n%%\n```\n## Tasks\n- [ ] a\n- [ ] x\n## Other\n",
    );
  });

  it("a four-backtick fence is not closed by three backticks", () => {
    const target = "````\n```\n## Tasks\n```\n````\n## Other\n- [ ] o\n";
    expect(placeGroups(target, [group("Tasks", "- [ ] x")], "")).toBe(`${target}- [ ] x\n`);
  });

  it("a hash tag line is not a heading", () => {
    const target = "#Tasks\n## Other\n- [ ] o\n";
    expect(placeGroups(target, [group("Tasks", "- [ ] x")], "")).toBe(`${target}- [ ] x\n`);
  });

  it("a trailing hash belongs to the heading unless a closing sequence follows whitespace", () => {
    const target = "## C#\n- [ ] a\n\n## Tasks ##\n- [ ] b\n";
    expect(placeGroups(target, [group("C#", "- [ ] x")], "")).toBe("## C#\n- [ ] a\n- [ ] x\n\n## Tasks ##\n- [ ] b\n");
    expect(placeGroups(target, [group("Tasks", "- [ ] y")], "")).toBe(
      "## C#\n- [ ] a\n\n## Tasks ##\n- [ ] b\n- [ ] y\n",
    );
  });

  it("an earlier insertion shifts the section a later group lands in", () => {
    const target = "## A\n- [ ] a\n## B\n- [ ] b\n";
    expect(placeGroups(target, [group("A", "- [ ] x"), group("B", "- [ ] y")], "")).toBe(
      "## A\n- [ ] a\n- [ ] x\n## B\n- [ ] b\n- [ ] y\n",
    );
  });

  it("a mixed-ending target keeps every existing line byte-identical", () => {
    expect(placeGroups("a\nb\r\nc\n", [group(null, "- [ ] x")], "")).toBe("a\nb\r\nc\n- [ ] x\r\n");
    expect(placeGroups("a\r\nb\nc\r\n", [group(null, "- [ ] x")], "")).toBe("a\r\nb\nc\r\n- [ ] x\r\n");
  });

  it("a target ending in a lone carriage return keeps it", () => {
    expect(placeGroups("a\nb\r", [group(null, "- [ ] x")], "")).toBe("a\nb\r\n- [ ] x");
  });

  it("appending to an empty note, a frontmatter-only note and a note with no trailing newline keeps lines separate", () => {
    const g = [group(null, "- [ ] x", "- [ ] y")];
    expect(placeGroups("", g, "")).toBe("- [ ] x\n- [ ] y\n");
    expect(placeGroups("---\na: b\n---\n", g, "")).toBe("---\na: b\n---\n- [ ] x\n- [ ] y\n");
    expect(placeGroups("---\na: b\n---", g, "")).toBe("---\na: b\n---\n- [ ] x\n- [ ] y");
    expect(placeGroups("last line", g, "")).toBe("last line\n- [ ] x\n- [ ] y");
  });

  it("inserting after existing items in a section goes before its first child heading", () => {
    const target = "## Tasks\n- [ ] a\n  - [ ] a1\n\n### Sub\n- [ ] s\n\n## Next\n- [ ] n\n";
    expect(placeGroups(target, [group(null, "- [ ] x")], "Tasks")).toBe(
      "## Tasks\n- [ ] a\n  - [ ] a1\n- [ ] x\n\n### Sub\n- [ ] s\n\n## Next\n- [ ] n\n",
    );
  });

  it("a section's child subsection keeps its own items to itself", () => {
    const target = "## Tasks\n- [ ] a\n- [ ] b\n\n### Someday\n- [ ] s1\n- [ ] s2\n";
    expect(placeGroups(target, [group("Tasks", "- [ ] x")], "")).toBe(
      "## Tasks\n- [ ] a\n- [ ] b\n- [ ] x\n\n### Someday\n- [ ] s1\n- [ ] s2\n",
    );
  });

  it("a section holding only a child heading receives lines directly under its own heading", () => {
    expect(placeGroups("## Tasks\n### Someday\n- [ ] s\n", [group(null, "- [ ] x")], "Tasks")).toBe(
      "## Tasks\n- [ ] x\n### Someday\n- [ ] s\n",
    );
  });

  it("a duplicated heading resolves to its first occurrence", () => {
    const target = "## Tasks\n- [ ] a\n\n## Other\n\n## Tasks\n- [ ] b\n";
    expect(placeGroups(target, [group("Tasks", "- [ ] x")], "")).toBe(
      "## Tasks\n- [ ] a\n- [ ] x\n\n## Other\n\n## Tasks\n- [ ] b\n",
    );
  });

  it("groups resolving to the same section keep their relative order", () => {
    const target = "## Tasks\n- [ ] a\n\n## End\n";
    expect(
      placeGroups(target, [group(null, "- [ ] x"), group("Tasks", "- [ ] y"), group("Nope", "- [ ] z")], "Tasks"),
    ).toBe("## Tasks\n- [ ] a\n- [ ] x\n- [ ] y\n- [ ] z\n\n## End\n");
  });

  it("an empty group inserts nothing", () => {
    expect(placeGroups("a\n", [group("Tasks")], "Tasks")).toBe("a\n");
  });

  it("an empty section receives lines directly under its heading", () => {
    expect(placeGroups("## Tasks\n\n## B\n", [group(null, "- [ ] x")], "Tasks")).toBe("## Tasks\n- [ ] x\n\n## B\n");
  });

  it("inserted lines take the target's CRLF line endings", () => {
    expect(placeGroups("## Tasks\r\n- [ ] a\r\n", [group(null, "- [ ] x\r", "- [ ] y")], "Tasks")).toBe(
      "## Tasks\r\n- [ ] a\r\n- [ ] x\r\n- [ ] y\r\n",
    );
    expect(placeGroups("a\r\nb", [group(null, "- [ ] x")], "")).toBe("a\r\nb\r\n- [ ] x");
  });

  it("is deterministic", () => {
    const g = [group("Work", "- [ ] x")];
    expect(placeGroups("## Work\n", g, "Tasks")).toBe(placeGroups("## Work\n", g, "Tasks"));
  });
});
