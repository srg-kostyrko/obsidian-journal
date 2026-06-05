import { describe, expect, it } from "vitest";

import { formatHasWrongWeek, templateHasWrongWeek } from "./wrong-week";

describe("formatHasWrongWeek", () => {
  it("flags a format using the ISO week token W", () => {
    expect(formatHasWrongWeek("YYYY-[W]ww")).toBe(false);
    expect(formatHasWrongWeek("GGGG-WW")).toBe(true);
  });

  it("ignores the locale week token w", () => {
    expect(formatHasWrongWeek("YYYY-ww")).toBe(false);
  });

  it("ignores a W that appears only inside an escaped literal", () => {
    expect(formatHasWrongWeek("[Week] ww")).toBe(false);
  });
});

describe("templateHasWrongWeek", () => {
  it("flags a date variable whose format uses W", () => {
    expect(templateHasWrongWeek("folder/{{date:GGGG-[W]WW}}")).toBe(true);
  });

  it("ignores a date variable whose format uses w", () => {
    expect(templateHasWrongWeek("folder/{{date:YYYY-[W]ww}}")).toBe(false);
  });

  it("ignores a template with no explicit date format", () => {
    expect(templateHasWrongWeek("folder/{{date}}.md")).toBe(false);
  });
});
