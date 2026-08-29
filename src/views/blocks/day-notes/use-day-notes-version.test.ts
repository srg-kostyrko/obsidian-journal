import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type ShallowRef } from "vue";

import type { AnchorString } from "@/calendar";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { overrideWith, testContainer } from "@/testing";

import { useDayNotesVersion } from "./use-day-notes-version";

function renderNothing(): null {
  return null;
}

describe("useDayNotesVersion", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invalidates for note membership and creation-metadata changes emitted after mount", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      modules: [journalsCoreModule],
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
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(1);
    await notes.rename(original, renamed);
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(2);
    notes.emitMetadataChanged(renamed);
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(3);
    await notes.delete(renamed);
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(4);

    unmount();
    notes.emitMetadataChanged(renamed);
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(4);
  });

  it("coalesces a burst into one refresh and refreshes again after the debounce window", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      modules: [journalsCoreModule],
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
    const original = "Notes/original.md" as VaultPath;
    const renamed = "Notes/renamed.md" as VaultPath;

    await notes.create(original, "");
    await notes.rename(original, renamed);
    notes.emitMetadataChanged(renamed);
    await notes.delete(renamed);

    expect(version?.value).toBe(0);
    await vi.advanceTimersByTimeAsync(99);
    expect(version?.value).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(version?.value).toBe(1);

    notes.emitMetadataChanged(renamed);
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(2);
  });

  it("cancels a pending refresh when unmounted", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      modules: [journalsCoreModule],
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
    const path = "Notes/example.md" as VaultPath;

    notes.emitMetadataChanged(path);
    unmount();
    await vi.advanceTimersByTimeAsync(100);

    expect(version?.value).toBe(0);
  });

  it("does not invalidate for a byte-only modified event", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      modules: [journalsCoreModule],
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
    await vi.advanceTimersByTimeAsync(100);

    expect(version?.value).toBe(0);
  });

  it("shares the debounce window with journal index changes", async () => {
    const notes = new FakeNotesService();
    const harness = await testContainer({
      modules: [journalsCoreModule],
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
    const index = harness.resolve(JournalsIndex);

    for (let i = 0; i < 5; i++) {
      index.register({
        journalName: "daily",
        anchor: `2026-05-0${i + 1}` as AnchorString,
        path: `Notes/entry-${i}.md` as VaultPath,
      });
    }

    expect(version?.value).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(version?.value).toBe(1);
  });
});
