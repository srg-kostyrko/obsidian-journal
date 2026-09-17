import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import UiNoteInput from "./UiNoteInput.vue";

describe("UiNoteInput", () => {
  it("offers matching notes before other matching files", async () => {
    const harness = await testContainer();
    harness.host.putFile("Attachments/roadmap.png");
    harness.host.putFile("Projects/Roadmap 2027.md");
    harness.host.putFile("Projects/Budget.md");

    harness.render(UiNoteInput, { props: { modelValue: "", "onUpdate:modelValue": vi.fn() } });

    const handle = harness.inputSuggests.attachments[0];
    expect(handle.query("road")).toEqual(["Projects/Roadmap 2027.md", "Attachments/roadmap.png"]);
  });

  it("offers nothing until something is typed", async () => {
    const harness = await testContainer();
    harness.host.putFile("Projects/Roadmap 2027.md");

    harness.render(UiNoteInput, { props: { modelValue: "", "onUpdate:modelValue": vi.fn() } });

    expect(harness.inputSuggests.attachments[0].query("")).toEqual([]);
  });

  it("fills in the picked file's link text", async () => {
    const harness = await testContainer();
    harness.host.putFile("Projects/Roadmap 2027.md");
    const update = vi.fn();

    harness.render(UiNoteInput, { props: { modelValue: "", "onUpdate:modelValue": update } });
    harness.inputSuggests.attachments[0].select("Projects/Roadmap 2027.md");

    expect(update).toHaveBeenCalledWith("Roadmap 2027");
  });
});
