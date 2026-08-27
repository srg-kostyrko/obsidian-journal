import { describe, expect, it } from "vitest";
import { defineComponent, type ShallowRef } from "vue";

import { NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { overrideWith, testContainer } from "@/testing";

import { useDayNotesVersion } from "./use-day-notes-version";

function renderNothing(): null {
  return null;
}

describe("useDayNotesVersion", () => {
  it("invalidates for note membership and creation-metadata changes emitted after mount", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      overrides: [overrideWith(NotesService, notes as unknown as NotesService)],
    });
    let version: Readonly<ShallowRef<number>> | undefined;
    const Probe = defineComponent({
      setup() {
        version = useDayNotesVersion();
        return renderNothing;
      },
    });
    const { unmount } = harness.render(Probe);
    const original = "Notes/original.md" as VaultPath;
    const renamed = "Notes/renamed.md" as VaultPath;

    expect(version?.value).toBe(0);
    await notes.create(original, "");
    expect(version?.value).toBe(1);
    await notes.rename(original, renamed);
    expect(version?.value).toBe(2);
    notes.emitMetadataChanged(renamed);
    expect(version?.value).toBe(3);
    await notes.delete(renamed);
    expect(version?.value).toBe(4);

    unmount();
    notes.emitMetadataChanged(renamed);
    expect(version?.value).toBe(4);
  });

  it("does not invalidate for a byte-only modified event", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      overrides: [overrideWith(NotesService, notes as unknown as NotesService)],
    });
    let version: Readonly<ShallowRef<number>> | undefined;
    const Probe = defineComponent({
      setup() {
        version = useDayNotesVersion();
        return renderNothing;
      },
    });
    harness.render(Probe);

    notes.emitModified("Notes/example.md" as VaultPath);

    expect(version?.value).toBe(0);
  });
});
