import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import FolderInput from "./FolderInput.vue";

describe("FolderInput", () => {
  it("offers folder candidates from NotesService.listFolders, filtered by query", async () => {
    const harness = await testContainer();
    harness.host.putFile("Daily/today.md");
    harness.host.putFile("Other/note.md");

    harness.render(FolderInput, { props: { modelValue: "", "onUpdate:modelValue": vi.fn() } });

    const handle = harness.inputSuggests.attachments[0];
    expect(handle.query("").toSorted()).toEqual(["Daily", "Other"]);
    expect(handle.query("ai")).toEqual(["Daily"]);
  });
});
