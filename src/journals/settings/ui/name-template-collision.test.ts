import { describe, expect, it } from "vitest";

import { nameTemplateCollides } from "./name-template-collision";

describe("nameTemplateCollides", () => {
  it("flags a fixed template with no variables", () => {
    expect(nameTemplateCollides("MyNote", [])).toBe(true);
  });

  it("does not flag a template carrying the date variable", () => {
    expect(nameTemplateCollides("{{date}}", [])).toBe(false);
  });

  it("does not flag a template carrying a formatted date variable", () => {
    expect(nameTemplateCollides("entry-{{date:YYYY-MM-DD}}", [])).toBe(false);
  });

  it("does not flag a template carrying a numbering variable", () => {
    expect(nameTemplateCollides("sprint-{{index}}", ["index"])).toBe(false);
  });

  it("flags a template whose only variable is a numbering name not in the journal's sources", () => {
    expect(nameTemplateCollides("sprint-{{index}}", [])).toBe(true);
  });

  it("does not flag an empty template", () => {
    expect(nameTemplateCollides("", [])).toBe(false);
  });
});
