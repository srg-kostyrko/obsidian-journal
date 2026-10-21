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
    const target = "---\ntitle: ## Tasks\n---\n```\n## Tasks\n```\ntext\n";
    expect(placeGroups(target, [group(null, "- [ ] x")], "Tasks")).toBe(`${target}- [ ] x\n`);
    const fm = "---\n# Tasks\n---\n~~~\n# Tasks\n~~~\n";
    expect(placeGroups(fm, [group("Tasks", "- [ ] x")], "Tasks")).toBe(`${fm}- [ ] x\n`);
  });

  it("appending to an empty note, a frontmatter-only note and a note with no trailing newline keeps lines separate", () => {
    const g = [group(null, "- [ ] x", "- [ ] y")];
    expect(placeGroups("", g, "")).toBe("- [ ] x\n- [ ] y\n");
    expect(placeGroups("---\na: b\n---\n", g, "")).toBe("---\na: b\n---\n- [ ] x\n- [ ] y\n");
    expect(placeGroups("---\na: b\n---", g, "")).toBe("---\na: b\n---\n- [ ] x\n- [ ] y");
    expect(placeGroups("last line", g, "")).toBe("last line\n- [ ] x\n- [ ] y");
  });

  it("inserting after existing items in a section goes before the next heading", () => {
    const target = "## Tasks\n- [ ] a\n  - [ ] a1\n\n### Sub\n- [ ] s\n\n## Next\n- [ ] n\n";
    expect(placeGroups(target, [group(null, "- [ ] x")], "Tasks")).toBe(
      "## Tasks\n- [ ] a\n  - [ ] a1\n\n### Sub\n- [ ] s\n- [ ] x\n\n## Next\n- [ ] n\n",
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
