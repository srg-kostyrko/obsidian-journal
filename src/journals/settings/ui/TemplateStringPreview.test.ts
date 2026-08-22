import { screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import TemplateStringPreview from "./TemplateStringPreview.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TemplateStringPreview", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("renders the resolved value when it contains a variable", () => {
    harness.render(TemplateStringPreview, {
      props: { journalName: "daily", value: "{{date:YYYY}}/journal", label: "Preview:" },
    });

    expect(screen.getByText("2026/journal")).toBeTruthy();
    expect(screen.getByText("Preview:")).toBeTruthy();
  });

  it("does not render when the value has no variables", () => {
    const { container: dom } = harness.render(TemplateStringPreview, {
      props: { journalName: "daily", value: "static/folder", label: "Preview:" },
    });

    expect(dom.textContent ?? "").toBe("");
  });
});
