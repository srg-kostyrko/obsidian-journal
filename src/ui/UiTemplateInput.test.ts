import { describe, expect, it, vi } from "vitest";

import { TemplatesService } from "@/infrastructure/host";
import { overrideWith, testContainer } from "@/testing";

import UiTemplateInput from "./UiTemplateInput.vue";

async function mountHandle() {
  const templates = {
    candidatePaths: () => ["templates/daily.md", "templates/weekly.md"],
  } as unknown as TemplatesService;
  const harness = await testContainer({
    overrides: [overrideWith(TemplatesService, templates)],
  });
  harness.render(UiTemplateInput, {
    props: { modelValue: "", "onUpdate:modelValue": vi.fn() },
  });
  return harness.inputSuggests.attachments[0];
}

describe("UiTemplateInput", () => {
  it("offers no suggestions for an empty query", async () => {
    // An empty query must not pop the entire vault's template path list.
    const handle = await mountHandle();
    expect(handle.query("")).toEqual([]);
  });

  it("filters candidate paths by query", async () => {
    const handle = await mountHandle();
    expect(handle.query("weekly")).toEqual(["templates/weekly.md"]);
  });
});
