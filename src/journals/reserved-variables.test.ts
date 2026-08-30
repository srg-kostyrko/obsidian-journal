import { describe, expect, it } from "vitest";

import { tokenize } from "@/templates";

import { isReservedVariable, RESERVED_VARIABLE_NAMES, TEMPLATE_VARIABLE_RE } from "./reserved-variables";

describe("reserved variable rules", () => {
  it.each(["index", "sprint", "_private", "pi24", "Release", "спринт", "реліз", "спринт2"])("accepts %s", (name) => {
    expect(TEMPLATE_VARIABLE_RE.test(name)).toBe(true);
  });

  it.each(["", "2fast", "with space", "with-dash", "with.dot"])("rejects %s", (name) => {
    expect(TEMPLATE_VARIABLE_RE.test(name)).toBe(false);
  });

  // A name the tokenizer cannot parse renders as a literal `{{...}}` in the note filename
  // rather than failing loudly, so the rule must match the tokenizer exactly.
  it("accepts exactly the names the tokenizer parses as a variable", () => {
    for (const name of ["sprint", "_private", "Release", "спринт", "реліз", "спринт2"]) {
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
        "notelet_index",
        "relative_date",
        "start_date",
        "time",
        "title",
        "week_of_month",
      ].toSorted(),
    );
  });

  it("reserves notelet_index", () => {
    expect(isReservedVariable("notelet_index")).toBe(true);
  });

  it("reserves week_of_month, which contextFor seeds as a derived variable", () => {
    expect(isReservedVariable("week_of_month")).toBe(true);
  });

  it("reserves a name that differs only in case, because the context lookup falls back to it", () => {
    expect(isReservedVariable("Date")).toBe(true);
    expect(isReservedVariable("START_DATE")).toBe(true);
  });
});
