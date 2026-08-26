import { describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";

import type { AnchorString } from "@/calendar";
import { calendarDisplaySlice } from "@/calendar/settings/display-slice";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import type { Module } from "@/infrastructure/di";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import { ShelvesService } from "@/shelves";
import { overrideWith, testContainer } from "@/testing";

import { useDayNotesPanel } from "./use-day-notes-panel";

const renderNothing = (): null => null;
const journalsIndexModule: Module = {
  register(container) {
    container.register(JournalsIndex).useClass(JournalsIndex);
  },
};

async function mountPanel(
  onNavigate?: (anchor: AnchorString) => void,
  options: {
    selectedShelf?: Ref<string | null>;
    shelfByJournal?: Readonly<Record<string, string>>;
  } = {},
) {
  const notes = new FakeNotesService();
  const selectedShelf = options.selectedShelf ?? ref<string | null>(null);
  const shelvesServiceModule: Module = {
    register(container) {
      container.register(ShelvesService).useValue({
        shelfOf: (journalName: string): string => options.shelfByJournal?.[journalName] ?? "",
      } as unknown as ShelvesService);
    },
  };
  const harness = await testContainer({
    modules: [calendarSettingsCoreModule, journalsIndexModule, shelvesServiceModule],
    overrides: [overrideWith(NotesService, notes as unknown as NotesService)],
  });
  harness.settings.getSlice(calendarDisplaySlice).state = {
    weekPlacement: "left",
    timelineNavigation: false,
    vaultDayNotes: true,
    vaultDayNotesSort: "modified-desc",
    vaultDayNotesIncludeJournals: true,
  };

  let panel: ReturnType<typeof useDayNotesPanel> | undefined;
  const Probe = defineComponent({
    setup() {
      panel = useDayNotesPanel(selectedShelf, onNavigate);
      return renderNothing;
    },
  });
  harness.render(Probe);
  if (!panel) throw new Error("panel was not captured");
  return { harness, notes, panel, selectedShelf };
}

describe("useDayNotesPanel", () => {
  it("does not select or open for a day with no created notes", async () => {
    const { panel } = await mountPanel();
    panel.select("2026-05-25" as AnchorString);
    expect(panel.selectedAnchor.value).toBeNull();
  });

  it("ignores date selection while the preview feature is disabled", async () => {
    const { harness, notes, panel } = await mountPanel();
    notes.seed("created.md" as VaultPath, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified("created.md" as VaultPath);
    const slice = harness.settings.getSlice(calendarDisplaySlice);
    slice.state = { ...slice.state, vaultDayNotes: false };
    await nextTick();

    panel.select("2026-05-25" as AnchorString);

    expect(panel.selectedAnchor.value).toBeNull();
  });

  it("ignores date navigation while the preview pane is closed", async () => {
    const { panel } = await mountPanel();

    panel.previous();
    panel.next();

    expect(panel.selectedAnchor.value).toBeNull();
  });

  it("navigates an open preview without requiring a navigation callback", async () => {
    const { notes, panel } = await mountPanel();
    notes.seed("created.md" as VaultPath, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified("created.md" as VaultPath);
    panel.select("2026-05-25" as AnchorString);

    panel.next();

    expect(panel.selectedAnchor.value).toBe("2026-05-26");
  });

  it("selects a populated day and clears selection on close", async () => {
    const { notes, panel } = await mountPanel();
    notes.seed("created.md" as VaultPath, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified("created.md" as VaultPath);

    panel.select("2026-05-25" as AnchorString);
    expect(panel.selectedAnchor.value).toBe("2026-05-25");
    expect(panel.notes.value.map((note) => note.path)).toEqual(["created.md"]);

    panel.close();
    expect(panel.selectedAnchor.value).toBeNull();
  });

  it("reacts to vault deletion by closing an emptied panel", async () => {
    const { notes, panel } = await mountPanel();
    const path = "created.md" as VaultPath;
    notes.seed(path, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified(path);
    panel.select("2026-05-25" as AnchorString);

    await notes.delete(path);
    await nextTick();

    expect(panel.selectedAnchor.value).toBeNull();
  });

  it("navigates across date boundaries and keeps the pane open on an empty destination", async () => {
    const onNavigate = vi.fn();
    const { notes, panel } = await mountPanel(onNavigate);
    notes.seed("created.md" as VaultPath, "", {}, { ctime: new Date(2026, 4, 31, 9).getTime() });
    notes.emitModified("created.md" as VaultPath);
    panel.select("2026-05-31" as AnchorString);

    panel.next();
    await nextTick();

    expect(panel.selectedAnchor.value).toBe("2026-06-01");
    expect(panel.notes.value).toHaveLength(0);
    expect(onNavigate).toHaveBeenLastCalledWith("2026-06-01");

    panel.previous();
    expect(panel.selectedAnchor.value).toBe("2026-05-31");
  });

  it("persists sorting changes globally across panel closes", async () => {
    const { harness, notes, panel } = await mountPanel();
    notes.seed("created.md" as VaultPath, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified("created.md" as VaultPath);
    panel.select("2026-05-25" as AnchorString);
    panel.sort.value = "name-asc";
    panel.close();

    panel.select("2026-05-25" as AnchorString);

    expect(panel.sort.value).toBe("name-asc");
    expect(harness.settings.getSlice(calendarDisplaySlice).state.vaultDayNotesSort).toBe("name-asc");
  });

  it("persists journal filtering and keeps an already-open pane reversible when filtering empties it", async () => {
    const { harness, notes, panel } = await mountPanel();
    const path = "daily.md" as VaultPath;
    notes.seed(path, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified(path);
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: "2026-05-25" as AnchorString,
      path,
    });
    panel.select("2026-05-25" as AnchorString);

    panel.includeJournals.value = false;
    await nextTick();

    expect(panel.notes.value).toHaveLength(0);
    expect(panel.selectedAnchor.value).toBe("2026-05-25");
    expect(harness.settings.getSlice(calendarDisplaySlice).state.vaultDayNotesIncludeJournals).toBe(false);
  });

  it("does not open when the persisted journal filter excludes every note on the day", async () => {
    const { harness, notes, panel } = await mountPanel();
    const path = "daily.md" as VaultPath;
    notes.seed(path, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified(path);
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: "2026-05-25" as AnchorString,
      path,
    });
    panel.includeJournals.value = false;

    panel.select("2026-05-25" as AnchorString);

    expect(panel.selectedAnchor.value).toBeNull();
  });

  it("keeps ordinary notes while limiting journal notes to the selected shelf", async () => {
    const { harness, notes, panel, selectedShelf } = await mountPanel(undefined, {
      selectedShelf: ref("Work"),
      shelfByJournal: { "work-daily": "Work", "personal-daily": "Personal" },
    });
    const workPath = "work.md" as VaultPath;
    const personalPath = "personal.md" as VaultPath;
    const regularPath = "idea.md" as VaultPath;
    for (const path of [workPath, personalPath, regularPath]) {
      notes.seed(path, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
      notes.emitModified(path);
    }
    harness.resolve(JournalsIndex).register({
      journalName: "work-daily",
      anchor: "2026-05-25" as AnchorString,
      path: workPath,
    });
    harness.resolve(JournalsIndex).register({
      journalName: "personal-daily",
      anchor: "2026-05-25" as AnchorString,
      path: personalPath,
    });

    panel.select("2026-05-25" as AnchorString);

    expect(panel.notes.value).toEqual([
      expect.objectContaining({ path: regularPath }),
      expect.objectContaining({ path: workPath, journalName: "work-daily", shelfName: "Work" }),
    ]);

    selectedShelf.value = "Personal";
    await nextTick();

    expect(panel.notes.value).toEqual([
      expect.objectContaining({ path: regularPath }),
      expect.objectContaining({ path: personalPath, journalName: "personal-daily", shelfName: "Personal" }),
    ]);
  });

  it("closes when the global feature toggle is disabled", async () => {
    const { harness, notes, panel } = await mountPanel();
    notes.seed("created.md" as VaultPath, "", {}, { ctime: new Date(2026, 4, 25, 9).getTime() });
    notes.emitModified("created.md" as VaultPath);
    panel.select("2026-05-25" as AnchorString);

    const slice = harness.settings.getSlice(calendarDisplaySlice);
    slice.state = { ...slice.state, vaultDayNotes: false };
    await nextTick();

    expect(panel.selectedAnchor.value).toBeNull();
  });
});
