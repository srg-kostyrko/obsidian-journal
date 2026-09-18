import { describe, expect, it } from "vitest";

import { toNoteLink } from "./note-link";

describe("toNoteLink", () => {
  it("wraps the trimmed text in brackets", () => {
    expect(toNoteLink("  Projects/Roadmap  ")).toBe("[[Projects/Roadmap]]");
  });

  it.each(["", " ".repeat(3)])("reads %j as no answer", (text) => {
    expect(toNoteLink(text)).toBeUndefined();
  });
});
