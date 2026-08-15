import { describe, expect, it } from "vitest";

import { tokenize } from "@/templates";

import { NUMBERING_VARIABLE_RE, RESERVED_VARIABLE_NAMES } from "./numbering-variables";

describe("numbering variable rules", () => {
  it.each(["index", "sprint", "_private", "pi24", "Release"])("accepts %s", (name) => {
    expect(NUMBERING_VARIABLE_RE.test(name)).toBe(true);
  });

  it.each(["", "2fast", "with space", "with-dash", "with.dot"])("rejects %s", (name) => {
    expect(NUMBERING_VARIABLE_RE.test(name)).toBe(false);
  });

  // A name the tokenizer cannot parse renders as a literal `{{...}}` in the note filename
  // rather than failing loudly, so the rule must match the tokenizer exactly.
  it("accepts exactly the names the tokenizer parses as a variable", () => {
    for (const name of ["sprint", "_private", "Release"]) {
      const template = `{{${name}}}`;
      expect(tokenize(template)).toEqual([{ kind: "variable", name, modifiers: [], format: undefined, raw: template }]);
    }
    for (const name of ["2fast", "with-dash"]) {
      const tokens = tokenize(`{{${name}}}`);
      expect(tokens.every((token) => token.kind !== "variable")).toBe(true);
    }
  });

  it("reserves every non-digit name the render context seeds", () => {
    expect([...RESERVED_VARIABLE_NAMES].toSorted()).toEqual(
      [
        "current_date",
        "current_time",
        "date",
        "end_date",
        "journal_name",
        "note_name",
        "relative_date",
        "start_date",
        "time",
        "title",
      ].toSorted(),
    );
  });
});
