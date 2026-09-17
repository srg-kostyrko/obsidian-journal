import { describe, expect, it } from "vitest";

import { splitFrontmatter } from "./document";

describe("splitFrontmatter", () => {
  it("splits a leading frontmatter block from the body", () => {
    expect(splitFrontmatter("---\nk: v\n---\nbody")).toEqual({
      open: "---\n",
      body: "k: v\n",
      close: "---\n",
      rest: "body",
    });
  });

  it("keeps CRLF delimiters", () => {
    expect(splitFrontmatter("---\r\nk: v\r\n---\r\nbody")).toEqual({
      open: "---\r\n",
      body: "k: v\r\n",
      close: "---\r\n",
      rest: "body",
    });
  });

  it("accepts an empty block and a closing line at the end of the text", () => {
    expect(splitFrontmatter("---\n---")).toEqual({ open: "---\n", body: "", close: "---", rest: "" });
  });

  it.each([
    ["no frontmatter", "body"],
    ["an unclosed block", "---\nk: v\n"],
    ["a block that is not at the start", "text\n---\nk: v\n---\n"],
    ["a longer dash line", "---\nk: v\n----\n"],
  ])("finds nothing in %s", (_label, template) => {
    expect(splitFrontmatter(template)).toBeUndefined();
  });

  it("closes only on a line that is exactly three dashes", () => {
    expect(splitFrontmatter("---\nk: ---\n---\nbody")?.body).toBe("k: ---\n");
  });
});
