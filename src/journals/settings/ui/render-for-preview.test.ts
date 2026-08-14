import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";
import { TemplateContext } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { renderForPreview } from "./render-for-preview";

describe("renderForPreview", () => {
  const engine = installTestEngine();
  const context = TemplateContext.empty()
    .string("journal_name", "daily")
    .date("date", CalendarDate.fromAnchor("2026-05-19" as never), "YYYY-MM-DD");

  it("renders the template with the given context", () => {
    expect(renderForPreview(engine, "{{journal_name}}-{{date}}", context)).toBe("daily-2026-05-19");
  });

  it("returns an empty string when the template cannot render", () => {
    expect(renderForPreview(engine, "{{unknown_var}}", context)).toBe("");
  });

  it("returns an empty string for an empty template", () => {
    expect(renderForPreview(engine, "", context)).toBe("");
  });
});
