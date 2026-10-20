import { TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import type { AnchorString } from "@/calendar";
import { Flows } from "@/infrastructure/flows";
import { NoteMetadataService, NotesService, WorkspaceOpenError, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";
import { AsyncResult, Option } from "@/infrastructure/result";
import { CreateNoteletFlow } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { EnsureJournalEntryFlow, OpenJournalEntryFlow } from "@/journals/flows";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import type { Prompt, PromptAnswer } from "@/journals/prompts/config";
import { JournalsRepository } from "@/journals/repository";
import { useCodeBlockPreviewPath } from "@/journals/settings/ui/use-code-block-preview-path";
import { buildNoteletType, customJournal, fixedJournal } from "@/journals/testing";
import type { NoteletEntry } from "@/journals/types";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { tasksCoreModule } from "@/tasks/module";
import { TaskProviderRegistry } from "@/tasks/provider-registry";
import { TaskIndex } from "@/tasks/task-index";
import { buildTaskItem } from "@/tasks/testing";
import type { TaskItem } from "@/tasks/types";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsApiService } from "./journals-api";
import { apiModule } from "./module";

import type { NoteletNote } from "./public-api";

const meeting = buildNoteletType({ id: "nt_meeting" as TypeId, name: "Meeting" });
const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

interface BuildOptions {
  /** Shelves to seed, keyed the same as their own name. Default: none. */
  shelves?: Record<string, ShelfConfig>;
  /** Leave the index un-ready so whenReady() stays pending. Default true. */
  ready?: boolean;
}

async function buildApi(journals: Record<string, JournalConfig>, options: BuildOptions = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
    data: { journals, shelves: options.shelves ?? {} },
    initialize: options.ready === false ? [] : [VaultSubscriptionService],
  });
  const api = harness.resolve(JournalsApiService);
  const index = harness.resolve(JournalsIndex);
  const repository = harness.resolve(JournalsRepository);
  const flows = vi.spyOn(harness.resolve(Flows), "invoke");
  return { harness, api, index, repo: repository, flows };
}

describe("JournalsApiService reads", () => {
  it("lists every journal when the selector is omitted", async () => {
    const { api } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    });

    const listed = await api.listJournals();

    expect(listed.map((info) => info.name).toSorted()).toEqual(["daily", "weekly"]);
  });

  it("does not wait for the index to be ready", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) }, { ready: false });

    const listed = await api.listJournals();

    expect(listed.map((info) => info.name)).toEqual(["daily"]);
  });

  it("ANDs the selector fields", async () => {
    const { api } = await buildApi(
      {
        workDaily: fixedJournal("workDaily", { type: "day" }),
        homeDaily: fixedJournal("homeDaily", { type: "day" }),
        workWeekly: fixedJournal("workWeekly", { type: "week" }),
      },
      { shelves: { Work: buildShelf("Work", { journals: ["workDaily", "workWeekly"] }) } },
    );

    const listed = await api.listJournals({ writeType: "day", shelf: "Work" });

    expect(listed.map((info) => info.name)).toEqual(["workDaily"]);
  });

  it("selects off-shelf journals with a null shelf", async () => {
    const { api } = await buildApi(
      { onShelf: fixedJournal("onShelf", { type: "day" }), loose: fixedJournal("loose", { type: "day" }) },
      { shelves: { Work: buildShelf("Work", { journals: ["onShelf"] }) } },
    );

    const listed = await api.listJournals({ shelf: null });

    expect(listed.map((info) => info.name)).toEqual(["loose"]);
  });

  it("returns null from journalInfo for an unknown journal", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    expect(await api.journalInfo("nope")).toBeNull();
  });

  it("reports a journal's notelet type names through journalInfo", async () => {
    const { api } = await buildApi({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        {
          notelets: { nt_meeting: buildNoteletType({ id: "nt_meeting" as TypeId, name: "Meeting" }) },
        },
      ),
    });

    const info = await api.journalInfo("daily");

    expect(info?.notelets).toEqual(["Meeting"]);
  });

  it("reports a period with no note as file null and a predicted path", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const [note] = await api.notesFor("daily", "2026-08-18");

    expect(note?.date).toBe("2026-08-18");
    expect(note?.displayDate).toBe("2026-08-18");
    expect(note?.endDate).toBe("2026-08-18");
    expect(note?.path).toBe("2026-08-18.md");
    expect(note?.file).toBeNull();
  });

  it("gives a weekly note its first day as date and its representative as displayDate", async () => {
    const { api } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });

    const [note] = await api.notesFor("weekly", "2026-01-01");

    expect(note?.date).toBe("2025-12-29");
    expect(note?.displayDate).toBe("2026-01-01");
    expect(note?.endDate).toBe("2026-01-04");
  });

  it("reports the note's real path when one exists, not the rendered one", async () => {
    const { api, index, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    harness.host.putFile("Somewhere/Else/renamed.md", "existing");
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Somewhere/Else/renamed.md" as VaultPath,
    });

    const [note] = await api.notesFor("daily", "2026-08-18");

    expect(note?.path).toBe("Somewhere/Else/renamed.md");
    expect(note?.file).not.toBeNull();
  });

  it("fans out across every matching journal", async () => {
    const { api } = await buildApi({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });

    const notes = await api.notesFor({ writeType: "day" }, "2026-08-18");

    expect(notes.map((note) => note.journal).toSorted()).toEqual(["a", "b"]);
  });

  it("gives a null path for a date outside the timeline with no note", async () => {
    const { api } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "day" },
        {
          timeline: {
            start: "2020-01-01" as AnchorString,
            end: { kind: "date", date: "2020-12-31" as AnchorString },
          },
        },
      ),
    });

    const [note] = await api.notesFor("past", "2026-08-18");

    expect(note?.path).toBeNull();
    expect(note?.file).toBeNull();
  });

  it("rejects a date it cannot read with invalid-date", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.notesFor("daily", "whenever")).rejects.toMatchObject({ code: "invalid-date" });
  });

  it("resolves journalOf from the file it was handed", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });
    const file = { path: "Journal/2026-08-18.md" } as never;

    const note = await api.journalOf(file);

    expect(note?.journal).toBe("daily");
    expect(note?.date).toBe("2026-08-18");
    expect(note?.file).toBe(file);
  });

  it("returns null from journalOf for a note that is not connected", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    expect(await api.journalOf({ path: "Random/note.md" })).toBeNull();
  });
});

async function seedNotelet(
  harness: Awaited<ReturnType<typeof buildApi>>["harness"],
  index: JournalsIndex,
  entry: Omit<NoteletEntry, "kind">,
): Promise<void> {
  const created = await harness.resolve(NotesService).create(entry.path, "");
  expect(created.isOk()).toBe(true);
  index.register({ kind: "notelet", ...entry });
}

describe("JournalsApiService notelet reads", () => {
  it("reads a notelet off the file it was handed", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });
    const file = { path: "Journal/Meeting 1.md" } as never;

    const note = await api.noteletOf(file);

    expect(note).toMatchObject({
      journal: "weekly",
      type: "Meeting",
      date: "2026-08-17",
      endDate: "2026-08-23",
      path: "Journal/Meeting 1.md",
      counter: 1,
    });
    expect(note?.file).toBe(file);
  });

  it("reports a null counter for a notelet that has none", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
    });

    const note = await api.noteletOf({ path: "Journal/Meeting.md" });

    expect(note?.counter).toBeNull();
  });

  it("reports the stored type name for a notelet whose type was deleted in keep mode", async () => {
    const { api, harness, index } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Orphan.md" as VaultPath,
      typeName: "Retired",
      typeId: null,
    });

    const note = await api.noteletOf({ path: "Journal/Orphan.md" });

    expect(note?.type).toBe("Retired");
  });

  it("returns null from noteletOf for a period note", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });

    expect(await api.noteletOf({ path: "Journal/2026-08-18.md" })).toBeNull();
  });

  it("returns null from noteletOf for an unconnected note", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    expect(await api.noteletOf({ path: "Random/note.md" })).toBeNull();
  });

  it("leaves journalOf answering null for a notelet", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    expect(await api.journalOf({ path: "Journal/Meeting 1.md" })).toBeNull();
  });

  it("returns a period's notelets ordered by type, then counter", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: {
            nt_meeting: meeting,
            nt_review: buildNoteletType({ id: "nt_review" as TypeId, name: "Review" }),
          },
        },
      ),
    });
    const anchor = "2026-08-17" as AnchorString;
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor,
      path: "Journal/Review.md" as VaultPath,
      typeName: "Review",
      typeId: "nt_review" as TypeId,
      counter: 1,
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor,
      path: "Journal/Meeting 2.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 2,
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    const found = await api.noteletsFor("weekly", "2026-08-19");

    expect(found.map((note) => note.path)).toEqual([
      "Journal/Meeting 1.md",
      "Journal/Meeting 2.md",
      "Journal/Review.md",
    ]);
  });

  it("finds a notelet from any day inside its period", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    const found = await api.noteletsFor("weekly", "2026-08-21");

    expect(found).toHaveLength(1);
    expect(found.at(0)?.date).toBe("2026-08-17");
  });

  it("fans across every journal the selector matches", async () => {
    const { api, harness, index } = await buildApi({
      work: fixedJournal("work", { type: "day" }, { notelets: { nt_meeting: meeting } }),
      home: fixedJournal("home", { type: "day" }, { notelets: { nt_meeting: meeting } }),
    });
    const anchor = "2026-08-18" as AnchorString;
    await seedNotelet(harness, index, {
      journalName: "work",
      anchor,
      path: "Work/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });
    await seedNotelet(harness, index, {
      journalName: "home",
      anchor,
      path: "Home/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    const found = await api.noteletsFor({ writeType: "day" }, "2026-08-18");

    expect(found.map((note) => note.journal).toSorted()).toEqual(["home", "work"]);
  });

  it("narrows to one type by name, per journal", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: {
            nt_meeting: meeting,
            nt_review: buildNoteletType({ id: "nt_review" as TypeId, name: "Review" }),
          },
        },
      ),
    });
    const anchor = "2026-08-17" as AnchorString;
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor,
      path: "Journal/Review.md" as VaultPath,
      typeName: "Review",
      typeId: "nt_review" as TypeId,
      counter: 1,
    });

    const found = await api.noteletsFor("weekly", "2026-08-19", { type: "Meeting" });

    expect(found.map((note) => note.path)).toEqual(["Journal/Meeting 1.md"]);
  });

  it("matches an orphaned notelet by the type name it still carries", async () => {
    const { api, harness, index } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Orphan.md" as VaultPath,
      typeName: "Retired",
      typeId: null,
    });

    const found = await api.noteletsFor("weekly", "2026-08-19", { type: "Retired" });

    expect(found.map((note) => note.type)).toEqual(["Retired"]);
  });

  it("returns empty for a type name the journal does not know, rather than failing", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    await seedNotelet(harness, index, {
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    await expect(api.noteletsFor("weekly", "2026-08-19", { type: "Nope" })).resolves.toEqual([]);
  });

  it("omits a notelet whose file the vault cannot resolve", async () => {
    const { api, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    index.register({
      kind: "notelet",
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    await expect(api.noteletsFor("weekly", "2026-08-19")).resolves.toEqual([]);
  });

  // Forced with a spy, not a fixture: CycleService.anchorOf (cycle.ts:123) walks a custom cycle
  // forward from its anchor and always answers Some, so no real config reaches this branch. The
  // suite's existing unmappable-date case records the same finding and uses the same shape. The
  // mock must persist rather than be *Once* — the fan-out calls anchorOf once per selected journal.
  it("omits a journal whose cycle cannot place the date instead of failing the fan-out", async () => {
    const { api, harness } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    vi.spyOn(harness.resolve(CycleService), "anchorOf").mockReturnValue(Option.none());

    await expect(api.noteletsFor("weekly", "2026-08-19")).resolves.toEqual([]);
  });

  it("rejects a date it cannot read with invalid-date", async () => {
    const { api } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });

    await expect(api.noteletsFor("weekly", "whenever")).rejects.toMatchObject({ code: "invalid-date" });
  });
});

describe("JournalsApiService range reads", () => {
  it("returns every period the window overlaps, including one that starts before it", async () => {
    const { api } = await buildApi({ monthly: fixedJournal("monthly", { type: "month" }) });

    const notes = await api.notesInRange("monthly", { from: "2026-01-15", to: "2026-02-15" });

    expect(notes.map((note) => note.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("reports a period once rather than once per day it covers", async () => {
    const { api } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });

    const notes = await api.notesInRange("weekly", { from: "2026-01-05", to: "2026-01-18" });

    expect(notes.map((note) => note.date)).toEqual(["2026-01-05", "2026-01-12"]);
  });

  // A custom interval the user pulled in leaves a gap between where it now ends and where the
  // next one begins, and CycleService.anchorOf walks backwards past that gap rather than into
  // it, so the period holding the window's start can be one that closed days earlier. The
  // notelet window listing already filters on this (anchorsInWindow); the note reads share the
  // hazard because they share intervalsInRange.
  it("leaves out a shortened interval that closed before the window opened", async () => {
    const { api, index } = await buildApi({ sprints: customJournal("sprints", "month", 1, "2026-03-01") });
    index.register({
      journalName: "sprints",
      anchor: "2026-02-01" as AnchorString,
      path: "Journal/feb.md" as VaultPath,
      endDate: "2026-02-10" as AnchorString,
    });

    const notes = await api.notesInRange("sprints", { from: "2026-02-20", to: "2026-03-15" });

    expect(notes.map((note) => note.date)).toEqual(["2026-02-11", "2026-03-01"]);
  });

  it("carries the note on disk and a predicted path for the periods without one", async () => {
    const { api, index, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    harness.host.putFile("Journal/2026-08-18.md", "existing");
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });

    const notes = await api.notesInRange("daily", { from: "2026-08-17", to: "2026-08-19" });

    expect(notes.map((note) => [note.date, note.path, note.file === null])).toEqual([
      ["2026-08-17", "2026-08-17.md", true],
      ["2026-08-18", "Journal/2026-08-18.md", false],
      ["2026-08-19", "2026-08-19.md", true],
    ]);
  });

  it("keeps a period outside the timeline as a cell with no path", async () => {
    const { api } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "day" },
        {
          timeline: {
            start: "2026-08-18" as AnchorString,
            end: { kind: "date", date: "2026-12-31" as AnchorString },
          },
        },
      ),
    });

    const notes = await api.notesInRange("past", { from: "2026-08-17", to: "2026-08-18" });

    expect(notes.map((note) => [note.date, note.path])).toEqual([
      ["2026-08-17", null],
      ["2026-08-18", "2026-08-18.md"],
    ]);
  });

  it("fans out one matching journal at a time", async () => {
    const { api } = await buildApi({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });

    const notes = await api.notesInRange({ writeType: "day" }, { from: "2026-08-17", to: "2026-08-18" });

    expect(notes.map((note) => `${note.journal}:${note.date}`)).toEqual([
      "a:2026-08-17",
      "a:2026-08-18",
      "b:2026-08-17",
      "b:2026-08-18",
    ]);
  });

  it("returns nothing for an inverted range", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.notesInRange("daily", { from: "2026-08-19", to: "2026-08-17" })).resolves.toEqual([]);
  });

  it("rejects a range bound it cannot read with invalid-date", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.notesInRange("daily", { from: "2026-08-17", to: "whenever" })).rejects.toMatchObject({
      code: "invalid-date",
    });
  });

  it("returns only the periods of the window that have a note", async () => {
    const { api, index, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    for (const anchor of ["2026-08-16", "2026-08-18"]) {
      harness.host.putFile(`Journal/${anchor}.md`, "existing");
      index.register({
        journalName: "daily",
        anchor: anchor as AnchorString,
        path: `Journal/${anchor}.md` as VaultPath,
      });
    }

    const notes = await api.existingNotes("daily", { from: "2026-08-17", to: "2026-08-19" });

    expect(notes.map((note) => note.date)).toEqual(["2026-08-18"]);
    expect(notes[0]?.file).not.toBeNull();
  });

  it("includes a note whose period starts before the window", async () => {
    const { api, index, harness } = await buildApi({ monthly: fixedJournal("monthly", { type: "month" }) });
    harness.host.putFile("Journal/2026-01.md", "existing");
    index.register({
      journalName: "monthly",
      anchor: "2026-01-01" as AnchorString,
      path: "Journal/2026-01.md" as VaultPath,
    });

    const notes = await api.existingNotes("monthly", { from: "2026-01-15", to: "2026-02-15" });

    expect(notes.map((note) => note.date)).toEqual(["2026-01-01"]);
  });

  it("leaves out an existing note whose shortened interval closed before the window opened", async () => {
    const { api, index, harness } = await buildApi({
      sprints: customJournal("sprints", "month", 1, "2026-03-01"),
    });
    for (const [anchor, endDate] of [
      ["2026-02-01", "2026-02-10"],
      ["2026-02-11", undefined],
    ] as const) {
      harness.host.putFile(`Journal/${anchor}.md`, "existing");
      index.register({
        journalName: "sprints",
        anchor: anchor as AnchorString,
        path: `Journal/${anchor}.md` as VaultPath,
        ...(endDate !== undefined && { endDate: endDate as AnchorString }),
      });
    }

    const notes = await api.existingNotes("sprints", { from: "2026-02-20", to: "2026-03-15" });

    expect(notes.map((note) => note.date)).toEqual(["2026-02-11"]);
  });

  it("returns every note the matched journals have written when no range is given", async () => {
    const { api, index, harness } = await buildApi({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });
    for (const [journalName, anchor] of [
      ["a", "2020-01-01"],
      ["a", "2026-08-18"],
      ["b", "2026-08-18"],
    ] as const) {
      harness.host.putFile(`${journalName}/${anchor}.md`, "existing");
      index.register({
        journalName,
        anchor: anchor as AnchorString,
        path: `${journalName}/${anchor}.md` as VaultPath,
      });
    }

    const notes = await api.existingNotes("a");

    expect(notes.map((note) => `${note.journal}:${note.date}`)).toEqual(["a:2020-01-01", "a:2026-08-18"]);
  });

  it("omits an indexed note whose file is no longer in the vault", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/vanished.md" as VaultPath,
    });

    await expect(api.existingNotes("daily")).resolves.toEqual([]);
  });

  it("returns nothing for a range inverted inside a single period", async () => {
    const { api, index, harness } = await buildApi({ monthly: fixedJournal("monthly", { type: "month" }) });
    harness.host.putFile("Journal/2026-01.md", "existing");
    index.register({
      journalName: "monthly",
      anchor: "2026-01-01" as AnchorString,
      path: "Journal/2026-01.md" as VaultPath,
    });

    await expect(api.existingNotes("monthly", { from: "2026-01-20", to: "2026-01-15" })).resolves.toEqual([]);
  });

  it("rejects a range bound existingNotes cannot read with invalid-date", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.existingNotes("daily", { from: "whenever", to: "2026-08-19" })).rejects.toMatchObject({
      code: "invalid-date",
    });
  });
});

function seed(
  harness: Awaited<ReturnType<typeof buildApi>>["harness"],
  index: JournalsIndex,
  notes: readonly (readonly [journalName: string, anchor: string, endDate?: string])[],
) {
  for (const [journalName, anchor, endDate] of notes) {
    harness.host.putFile(`${journalName}/${anchor}.md`, "existing");
    index.register({
      journalName,
      anchor: anchor as AnchorString,
      path: `${journalName}/${anchor}.md` as VaultPath,
      ...(endDate !== undefined && { endDate: endDate as AnchorString }),
    });
  }
}

describe("JournalsApiService adjacent reads", () => {
  it("finds the nearest earlier note before the period holding the date, across a gap", async () => {
    const { api, index, harness } = await buildApi({ monthly: fixedJournal("monthly", { type: "month" }) });
    seed(harness, index, [
      ["monthly", "2026-06-01"],
      ["monthly", "2026-08-01"],
      ["monthly", "2026-10-01"],
    ]);

    const notes = await api.previousNote("monthly", "2026-10-18");

    expect(notes.map((note) => note.date)).toEqual(["2026-08-01"]);
    expect(notes[0]?.path).toBe("monthly/2026-08-01.md");
  });

  it("finds the nearest later note after the period holding the date, across a gap", async () => {
    const { api, index, harness } = await buildApi({ monthly: fixedJournal("monthly", { type: "month" }) });
    seed(harness, index, [
      ["monthly", "2026-06-01"],
      ["monthly", "2026-08-01"],
      ["monthly", "2026-10-01"],
    ]);

    const notes = await api.nextNote("monthly", "2026-08-15");

    expect(notes.map((note) => note.date)).toEqual(["2026-10-01"]);
  });

  it("steps back from a custom interval's start, not from the date", async () => {
    const { api, index, harness } = await buildApi({
      sprints: customJournal("sprints", "month", 1, "2026-03-01"),
    });
    seed(harness, index, [
      ["sprints", "2026-02-01", "2026-02-10"],
      ["sprints", "2026-02-11"],
    ]);

    const notes = await api.previousNote("sprints", "2026-02-15");

    expect(notes.map((note) => note.date)).toEqual(["2026-02-01"]);
  });

  it("answers once per matched journal", async () => {
    const { api, index, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }),
      monthly: fixedJournal("monthly", { type: "month" }),
    });
    seed(harness, index, [
      ["daily", "2026-10-09"],
      ["daily", "2026-10-10"],
      ["monthly", "2026-08-01"],
      ["monthly", "2026-09-01"],
    ]);

    const notes = await api.previousNote({}, "2026-10-18");

    expect(notes.map((note) => `${note.journal}:${note.date}`)).toEqual(["daily:2026-10-10", "monthly:2026-09-01"]);
  });

  it("leaves out a journal with no note on that side", async () => {
    const { api, index, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    seed(harness, index, [["daily", "2026-10-10"]]);

    await expect(api.previousNote("daily", "2026-10-10")).resolves.toEqual([]);
    await expect(api.nextNote("daily", "2026-10-10")).resolves.toEqual([]);
  });

  it("steps past an indexed note whose file is no longer in the vault", async () => {
    const { api, index, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    seed(harness, index, [["daily", "2026-10-01"]]);
    index.register({
      journalName: "daily",
      anchor: "2026-10-10" as AnchorString,
      path: "daily/vanished.md" as VaultPath,
    });

    const notes = await api.previousNote("daily", "2026-10-18");

    expect(notes.map((note) => note.date)).toEqual(["2026-10-01"]);
  });

  it("waits for the index to be ready", async () => {
    const { api, index, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) }, { ready: false });
    let settled = false;
    const pending = api.previousNote("daily", "2026-10-18").then((notes) => {
      settled = true;
      return notes;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    seed(harness, index, [["daily", "2026-10-10"]]);
    index.markReady();

    await expect(pending).resolves.toHaveLength(1);
  });

  it("rejects a date it cannot read with invalid-date", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.nextNote("daily", "whenever")).rejects.toMatchObject({ code: "invalid-date" });
  });
});

async function buildTasksApi(journals: Record<string, JournalConfig>, shelves: Record<string, ShelfConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
    data: { journals, shelves },
    initialize: [VaultSubscriptionService, TaskProviderRegistry],
  });
  return {
    api: harness.resolve(JournalsApiService),
    index: harness.resolve(JournalsIndex),
    tasks: harness.resolve(TaskIndex),
  };
}

function taskLine(
  path: string,
  line: number,
  markdown: string,
  overrides: Partial<Pick<TaskItem, "status" | "dates">> & { parentLine?: number } = {},
): TaskItem {
  const { parentLine = null, ...rest } = overrides;
  return buildTaskItem({
    path: path as VaultPath,
    key: `${path}:${line}`,
    display: { kind: "line", path: path as VaultPath, line, endLine: line, parentLine, markdown },
    ...rest,
  });
}

function registerNote(index: JournalsIndex, journalName: string, anchor: string, path: string): void {
  index.register({ journalName, anchor: anchor as AnchorString, path: path as VaultPath });
}

describe("JournalsApiService tasksFor", () => {
  const daily = fixedJournal("daily", { type: "day" });
  const monthly = fixedJournal("monthly", { type: "month" });

  it("returns the open tasks of the note for the period holding the date, in the public shape", async () => {
    const { api, index, tasks } = await buildTasksApi({ daily });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [
      taskLine("D/2026-09-22.md", 3, "- [ ] Ship it 📅 2026-09-30", { dates: { due: "2026-09-30" as AnchorString } }),
      taskLine("D/2026-09-22.md", 4, "- [x] Shipped", { status: "done" }),
    ]);

    const found = await api.tasksFor("daily", "2026-09-22");

    expect(found).toEqual([
      {
        journal: "daily",
        date: "2026-09-22",
        path: "D/2026-09-22.md",
        source: "note",
        line: 3,
        text: "- [ ] Ship it 📅 2026-09-30",
        status: "todo",
        dates: { due: "2026-09-30" },
        relations: ["containment"],
        parentLine: null,
      },
    ]);
  });

  it("answers status the way the code block's status key does", async () => {
    const { api, index, tasks } = await buildTasksApi({ daily });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [
      taskLine("D/2026-09-22.md", 1, "- [ ] a"),
      taskLine("D/2026-09-22.md", 2, "- [/] b", { status: "in-progress" }),
      taskLine("D/2026-09-22.md", 3, "- [x] c", { status: "done" }),
      taskLine("D/2026-09-22.md", 4, "- [-] d", { status: "cancelled" }),
    ]);
    const lines = async (status?: string) => {
      const found = await api.tasksFor("daily", "2026-09-22", status === undefined ? {} : { status });
      return found.map((task) => task.line);
    };

    expect(await lines()).toEqual([1, 2]);
    expect(await lines("done")).toEqual([3, 4]);
    expect(await lines("all")).toEqual([1, 2, 3, 4]);
    expect(await lines("in-progress")).toEqual([2]);
  });

  it("applies the journal's own listing filter, which an explicit status replaces", async () => {
    const doneOnly = {
      ...daily,
      tasks: {
        providers: {},
        filter: {
          mode: "and" as const,
          conditions: [{ type: "status" as const, condition: "is" as const, statuses: ["done"] }],
        },
      },
    };
    const { api, index, tasks } = await buildTasksApi({ daily: doneOnly });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [
      taskLine("D/2026-09-22.md", 1, "- [ ] open"),
      taskLine("D/2026-09-22.md", 2, "- [x] done", { status: "done" }),
    ]);

    const bare = await api.tasksFor("daily", "2026-09-22");
    const explicit = await api.tasksFor("daily", "2026-09-22", { status: "open" });

    expect(bare.map((task) => task.line)).toEqual([2]);
    expect(explicit.map((task) => task.line)).toEqual([1]);
  });

  it("reads the notelets of the period too, unless source narrows it", async () => {
    const { api, index, tasks } = await buildTasksApi({
      daily: fixedJournal("daily", { type: "day" }, { notelets: { nt_meeting: meeting } }),
    });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: "2026-09-22" as AnchorString,
      path: "D/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [
      taskLine("D/2026-09-22.md", 1, "- [ ] in note"),
    ]);
    tasks.publish("checkbox", { path: "D/Meeting 1.md" as VaultPath }, [
      taskLine("D/Meeting 1.md", 1, "- [ ] in meeting"),
    ]);
    const sources = async (source?: "note" | "notelets" | "both") => {
      const found = await api.tasksFor("daily", "2026-09-22", source === undefined ? {} : { source });
      return found.map((task) => `${task.source}:${task.path}`);
    };

    expect(await sources()).toEqual(["note:D/2026-09-22.md", "notelet:D/Meeting 1.md"]);
    expect(await sources("note")).toEqual(["note:D/2026-09-22.md"]);
    expect(await sources("notelets")).toEqual(["notelet:D/Meeting 1.md"]);
  });

  it("rolls a month up into its days only when asked", async () => {
    const { api, index, tasks } = await buildTasksApi({ daily, monthly });
    registerNote(index, "monthly", "2026-09-01", "M/2026-09.md");
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    registerNote(index, "daily", "2026-10-01", "D/2026-10-01.md");
    tasks.publish("checkbox", { path: "M/2026-09.md" as VaultPath }, [taskLine("M/2026-09.md", 1, "- [ ] month")]);
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [taskLine("D/2026-09-22.md", 1, "- [ ] day")]);
    tasks.publish("checkbox", { path: "D/2026-10-01.md" as VaultPath }, [
      taskLine("D/2026-10-01.md", 1, "- [ ] next month"),
    ]);

    const literal = await api.tasksFor("monthly", "2026-09-15");
    const rollup = await api.tasksFor("monthly", "2026-09-15", { depth: "rollup" });

    expect(literal.map((task) => task.path)).toEqual(["M/2026-09.md"]);
    expect(rollup.map((task) => `${task.journal}:${task.date}`)).toEqual(["monthly:2026-09-01", "daily:2026-09-22"]);
  });

  it("rolls up through the host journal's shelf only", async () => {
    const otherDaily = fixedJournal("otherDaily", { type: "day" });
    const { api, index, tasks } = await buildTasksApi(
      { daily, monthly, otherDaily },
      {
        Work: buildShelf("Work", { journals: ["daily", "monthly"] }),
        Home: buildShelf("Home", { journals: ["otherDaily"] }),
      },
    );
    registerNote(index, "monthly", "2026-09-01", "M/2026-09.md");
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    registerNote(index, "otherDaily", "2026-09-22", "O/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [taskLine("D/2026-09-22.md", 1, "- [ ] work")]);
    tasks.publish("checkbox", { path: "O/2026-09-22.md" as VaultPath }, [taskLine("O/2026-09-22.md", 1, "- [ ] home")]);

    const rollup = await api.tasksFor("monthly", "2026-09-15", { depth: "rollup" });

    expect(rollup.map((task) => task.path)).toEqual(["D/2026-09-22.md"]);
  });

  it("lists an item reached through two matched journals once", async () => {
    const { api, index, tasks } = await buildTasksApi({ daily, monthly });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [taskLine("D/2026-09-22.md", 1, "- [ ] day")]);

    const found = await api.tasksFor({}, "2026-09-22", { depth: "rollup" });

    expect(found.map((task) => `${task.journal}:${task.line}`)).toEqual(["daily:1"]);
  });

  it("returns a dated checkbox line from a note no journal owns, under the period asked about", async () => {
    const { api, tasks } = await buildTasksApi({ daily: fixedJournal("daily", { type: "day" }) });
    tasks.publish("checkbox", { path: "Projects/a.md" as VaultPath }, [
      buildTaskItem({
        path: "Projects/a.md" as VaultPath,
        key: "Projects/a.md:2",
        display: {
          kind: "line",
          path: "Projects/a.md" as VaultPath,
          line: 2,
          endLine: 2,
          parentLine: null,
          markdown: null,
        },
      }),
      buildTaskItem({
        path: "Projects/a.md" as VaultPath,
        key: "Projects/a.md:3",
        relations: ["date"],
        display: {
          kind: "line",
          path: "Projects/a.md" as VaultPath,
          line: 3,
          endLine: 3,
          parentLine: 2,
          markdown: "- [ ] ship",
        },
        dates: { due: "2026-10-24" as AnchorString },
      }),
    ]);

    const found = await api.tasksFor({}, "2026-10-24");

    expect(found).toEqual([
      {
        journal: "daily",
        date: "2026-10-24",
        path: "Projects/a.md",
        source: "note",
        line: 3,
        text: "- [ ] ship",
        status: "todo",
        dates: { due: "2026-10-24" },
        relations: ["date"],
        parentLine: 2,
      },
    ]);
  });

  // Journal order is the falsifier: the monthly journal reaches the day note's dated line through
  // its date pass, and asked first it would claim the line before the day journal that holds it.
  it("attributes a dated line in a period's note to that note's journal, whichever journal is asked first", async () => {
    const { api, index, tasks } = await buildTasksApi({ monthly, daily });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [
      buildTaskItem({
        path: "D/2026-09-22.md" as VaultPath,
        key: "D/2026-09-22.md:1",
        relations: ["containment", "date"],
        display: {
          kind: "line",
          path: "D/2026-09-22.md" as VaultPath,
          line: 1,
          endLine: 1,
          parentLine: null,
          markdown: null,
        },
        dates: { due: "2026-09-22" as AnchorString },
      }),
    ]);

    const found = await api.tasksFor({}, "2026-09-22");

    expect(found.map((task) => `${task.journal}:${task.date}:${task.line}`)).toEqual(["daily:2026-09-22:1"]);
  });

  describe("dated task notes", () => {
    const TASK_NOTE = "Tasks/ship.md";

    function taskNote(dates: TaskItem["dates"]): TaskItem {
      return buildTaskItem({
        provider: "note-property",
        key: `note-property:${TASK_NOTE}`,
        path: TASK_NOTE as VaultPath,
        relations: ["date"],
        capabilities: { movable: false, stampable: false, retargetable: true },
        display: { kind: "note", path: TASK_NOTE as VaultPath, title: "Ship it" },
        dates,
      });
    }

    it("returns a task note scheduled on the day, attributed to the journal and period asked about", async () => {
      const { api, tasks } = await buildTasksApi({ daily });
      tasks.publish("note-property", { path: TASK_NOTE as VaultPath }, [
        taskNote({ scheduled: "2026-09-22" as AnchorString }),
      ]);

      const found = await api.tasksFor("daily", "2026-09-22");

      expect(found).toEqual([
        {
          journal: "daily",
          date: "2026-09-22",
          path: TASK_NOTE,
          source: "note",
          line: null,
          text: "Ship it",
          status: "todo",
          dates: { scheduled: "2026-09-22" },
          relations: ["date"],
          parentLine: null,
        },
      ]);
    });

    it("filters it out when the date option names a date it does not carry", async () => {
      const { api, tasks } = await buildTasksApi({ daily });
      tasks.publish("note-property", { path: TASK_NOTE as VaultPath }, [
        taskNote({ scheduled: "2026-09-22" as AnchorString }),
      ]);

      expect(await api.tasksFor("daily", "2026-09-22", { date: "due" })).toEqual([]);
      expect(await api.tasksFor("daily", "2026-09-22", { date: "scheduled" })).toHaveLength(1);
    });

    it("rejects a date option outside the date choices with invalid-option", async () => {
      const { api } = await buildTasksApi({ daily });

      await expect(api.tasksFor("daily", "2026-09-22", { date: "deadline" as unknown as "due" })).rejects.toMatchObject(
        { code: "invalid-option" },
      );
    });

    it("returns it once for a selector matching two journals, under the first in selection order", async () => {
      const { api, tasks } = await buildTasksApi({ work: fixedJournal("work", { type: "day" }), daily });
      tasks.publish("note-property", { path: TASK_NOTE as VaultPath }, [
        taskNote({ due: "2026-09-22" as AnchorString }),
      ]);

      const found = await api.tasksFor({}, "2026-09-22");

      expect(found.map((task) => task.journal)).toEqual(["work"]);
    });

    it("attributes it to the selected journal that admits it, not the first in selection order", async () => {
      const noFilter = { mode: "and" as const, conditions: [] };
      const personal = fixedJournal(
        "personal",
        { type: "day" },
        { tasks: { filter: noFilter, providers: { "note-property": { show: "none", mode: "and", conditions: [] } } } },
      );
      const work = fixedJournal(
        "work",
        { type: "day" },
        {
          tasks: {
            filter: noFilter,
            providers: {
              "note-property": { show: "matching", mode: "and", conditions: [{ type: "tag", tags: ["#work"] }] },
            },
          },
        },
      );
      const { api, tasks } = await buildTasksApi({ personal, work });
      tasks.publish("note-property", { path: TASK_NOTE as VaultPath }, [
        { ...taskNote({ due: "2026-09-22" as AnchorString }), facts: { frontmatterTags: ["#task", "#work"] } },
      ]);

      const found = await api.tasksFor({}, "2026-09-22");

      expect(found.map((task) => task.journal)).toEqual(["work"]);
    });
  });

  it("returns only matching items, pointing a child at an enclosing task that did not match", async () => {
    const { api, index, tasks } = await buildTasksApi({ daily });
    registerNote(index, "daily", "2026-09-22", "D/2026-09-22.md");
    tasks.publish("checkbox", { path: "D/2026-09-22.md" as VaultPath }, [
      taskLine("D/2026-09-22.md", 1, "- [x] parent", { status: "done" }),
      taskLine("D/2026-09-22.md", 2, "\t- [ ] child", { parentLine: 1 }),
      taskLine("D/2026-09-22.md", 4, "\t- [ ] under a plain bullet", { parentLine: 3 }),
    ]);

    const found = await api.tasksFor("daily", "2026-09-22");

    expect(found.map((task) => [task.line, task.parentLine])).toEqual([
      [2, 1],
      [4, null],
    ]);
  });

  it("waits for the index to be ready", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
      data: { journals: { daily }, shelves: {} },
      initialize: [TaskProviderRegistry],
    });
    const api = harness.resolve(JournalsApiService);
    let settled = false;
    const pending = api.tasksFor("daily", "2026-09-22").then((found) => {
      settled = true;
      return found;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.resolve(JournalsIndex).markReady();

    await expect(pending).resolves.toEqual([]);
  });

  it("waits for the task providers to start, which on a reload comes after the index is ready", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
      data: { journals: { daily }, shelves: {} },
    });
    harness.resolve(JournalsIndex).markReady();
    const api = harness.resolve(JournalsApiService);
    let settled = false;
    const pending = api.tasksFor("daily", "2026-09-22").then((found) => {
      settled = true;
      return found;
    });
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(settled).toBe(false);

    harness.resolve(TaskProviderRegistry).initialize();

    await expect(pending).resolves.toEqual([]);
  });

  it("rejects with plugin-unloaded when Journals unloads while a note's task text is being read", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
      data: { journals: { daily }, shelves: {} },
      initialize: [VaultSubscriptionService, TaskProviderRegistry],
    });
    harness.host.putFile("D/2026-09-22.md", "- [ ] unhydrated");
    registerNote(harness.resolve(JournalsIndex), "daily", "2026-09-22", "D/2026-09-22.md");
    const path = "D/2026-09-22.md" as VaultPath;
    harness.resolve(TaskIndex).publish("checkbox", { path }, [
      buildTaskItem({
        path,
        key: `${path}:0`,
        display: { kind: "line", path, line: 0, endLine: 0, parentLine: null, markdown: null },
      }),
    ]);
    const read = Promise.withResolvers<{ kind: "ok"; value: string }>();
    vi.spyOn(harness.resolve(NotesService), "readCached").mockReturnValue(
      read.promise as unknown as ReturnType<NotesService["readCached"]>,
    );
    const api = harness.resolve(JournalsApiService);
    const pending = api.tasksFor("daily", "2026-09-22");
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    await api[Symbol.asyncDispose]();
    read.resolve({ kind: "ok", value: "- [ ] unhydrated" });

    await expect(pending).rejects.toMatchObject({ code: "plugin-unloaded" });
  });

  it("rejects a date it cannot read with invalid-date", async () => {
    const { api } = await buildTasksApi({ daily });

    await expect(api.tasksFor("daily", "whenever")).rejects.toMatchObject({ code: "invalid-date" });
  });
});

describe("JournalsApiService notelet range reads", () => {
  it("returns notelets from every period the window overlaps", async () => {
    const { api, harness, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    for (const anchor of ["2026-08-10", "2026-08-17"]) {
      await seedNotelet(harness, index, {
        journalName: "weekly",
        anchor: anchor as AnchorString,
        path: `Journal/Meeting ${anchor}.md` as VaultPath,
        typeName: "Meeting",
        typeId: "nt_meeting" as TypeId,
        counter: 1,
      });
    }

    const notelets = await api.noteletsInRange("weekly", { from: "2026-08-14", to: "2026-08-18" });

    expect(notelets.map((notelet) => notelet.date)).toEqual(["2026-08-10", "2026-08-17"]);
  });

  it("orders notelets by journal before period", async () => {
    const { api, harness, index } = await buildApi({
      a: fixedJournal("a", { type: "week" }, { notelets: { nt_meeting: meeting } }),
      b: fixedJournal("b", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    for (const [journalName, anchor] of [
      ["a", "2026-08-17"],
      ["b", "2026-08-10"],
    ] as const) {
      await seedNotelet(harness, index, {
        journalName,
        anchor: anchor as AnchorString,
        path: `Journal/${journalName} Meeting.md` as VaultPath,
        typeName: "Meeting",
        typeId: "nt_meeting" as TypeId,
        counter: 1,
      });
    }

    const notelets = await api.noteletsInRange({ writeType: "week" }, { from: "2026-08-10", to: "2026-08-23" });

    expect(notelets.map((notelet) => `${notelet.journal}:${notelet.date}`)).toEqual(["a:2026-08-17", "b:2026-08-10"]);
  });

  it("filters by the stored type name, so a notelet whose type was deleted in keep mode still matches", async () => {
    const { api, harness, index } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });
    for (const typeName of ["Retired", "Kept"]) {
      await seedNotelet(harness, index, {
        journalName: "weekly",
        anchor: "2026-08-17" as AnchorString,
        path: `Journal/${typeName}.md` as VaultPath,
        typeName,
        typeId: null,
      });
    }

    const notelets = await api.noteletsInRange("weekly", { from: "2026-08-17", to: "2026-08-23" }, { type: "Retired" });

    expect(notelets.map((notelet) => notelet.type)).toEqual(["Retired"]);
  });
});

describe("JournalsApiService writes", () => {
  it("creates the note through the ensure flow and reports created", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18");

    expect(result.created).toBe(true);
    expect(result.note.journal).toBe("daily");
    expect(result.note.file).not.toBeNull();
    expect(flows).toHaveBeenLastCalledWith(EnsureJournalEntryFlow, expect.anything(), expect.anything());
  });

  it("returns the created note with the index already caught up", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18");

    // NoteCreationService registers the entry it writes from the same frontmatter, so the index
    // knows the note the moment ensureNote resolves — it does not wait for Obsidian's metadata
    // cache to re-parse the file, which is what used to leave a window for a concurrent call to
    // find no entry and create a second note.
    expect(index.entryByAnchor("daily", "2026-08-18" as AnchorString).isSome()).toBe(true);
    expect(result.note.path).toBe("2026-08-18.md");
    expect(result.note.file).not.toBeNull();
    expect(result.note.endDate).toBe("2026-08-18");
  });

  it("opens through the open flow, passing the open mode", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api.openNote("daily", "2026-08-18", { openMode: "split" });

    expect(flows).toHaveBeenLastCalledWith(
      OpenJournalEntryFlow,
      expect.objectContaining({ openMode: "split" }),
      expect.anything(),
    );
  });

  it("opens through the open flow, passing the pin setting", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api.openNote("daily", "2026-08-18", { pinned: true });

    expect(flows).toHaveBeenLastCalledWith(
      OpenJournalEntryFlow,
      expect.objectContaining({ pinned: true }),
      expect.anything(),
    );
  });

  it("rejects with no-matching-journal when the selector matches nothing", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.ensureNote({ writeType: "quarter" }, "2026-08-18")).rejects.toMatchObject({
      code: "no-matching-journal",
    });
  });

  it("rejects with journal-not-found for an unknown name", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.ensureNote("nope", "2026-08-18")).rejects.toMatchObject({ code: "journal-not-found" });
  });

  it("rejects with outside-timeline when no note exists and the date is out of range", async () => {
    const { api } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "day" },
        {
          timeline: {
            start: "2020-01-01" as AnchorString,
            end: { kind: "date", date: "2020-12-31" as AnchorString },
          },
        },
      ),
    });

    await expect(api.ensureNote("past", "2026-08-18")).rejects.toMatchObject({ code: "outside-timeline" });
  });

  it("maps a cycle miss to the unmappable-date code", async () => {
    // Every name reaching this point already came from #select(), which only returns
    // journals JournalsRepository confirms exist — and CycleService.anchorOf returns None
    // only for a journal that does not exist, so a real config can never produce this state.
    // The spy forces it anyway: the code string is the one thing a consumer can discriminate
    // on across the published boundary, and the open `(string & {})` union means a misspelled
    // literal here still type-checks. This test exists purely to catch that typo, not to
    // exercise a reachable user path.
    const { api, harness } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "day" },
        {
          timeline: {
            start: "2020-01-01" as AnchorString,
            end: { kind: "date", date: "2020-12-31" as AnchorString },
          },
        },
      ),
    });
    // Must persist (not *Once*): #resolveOne calls anchorOf twice for this selector — once in
    // #eligible, once in the mappable fallback — and a one-shot mock would let the second call
    // fall through to the real implementation, flipping the verdict to outside-timeline.
    vi.spyOn(harness.resolve(CycleService), "anchorOf").mockReturnValue(Option.none());

    await expect(api.ensureNote("past", "2026-08-18")).rejects.toMatchObject({ code: "unmappable-date" });
  });

  it("still reaches a note that exists outside the timeline", async () => {
    const { api, index, harness } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "day" },
        {
          timeline: {
            start: "2020-01-01" as AnchorString,
            end: { kind: "date", date: "2020-12-31" as AnchorString },
          },
        },
      ),
    });
    harness.host.putFile("Past/2026-08-18.md", "existing");
    index.register({
      journalName: "past",
      anchor: "2026-08-18" as AnchorString,
      path: "Past/2026-08-18.md" as VaultPath,
    });

    const result = await api.ensureNote("past", "2026-08-18");

    expect(result.note.path).toBe("Past/2026-08-18.md");
    expect(result.created).toBe(false);
  });

  it("reports open-failed when the workspace refuses to open the note", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    vi.spyOn(harness.resolve(WorkspaceService), "openNote").mockReturnValueOnce(
      AsyncResult.err(new WorkspaceOpenError("2026-08-18.md" as VaultPath, new Error("no such view"))),
    );

    await expect(api.openNote("daily", "2026-08-18")).rejects.toMatchObject({ code: "open-failed" });
  });

  it("reports creation-failed when the written note cannot be read back", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    vi.spyOn(harness.resolve(NoteFileService), "resolve").mockReturnValueOnce(null);

    await expect(api.ensureNote("daily", "2026-08-18")).rejects.toMatchObject({ code: "creation-failed" });
  });

  it("falls back to creation-failed for a flow failure that is neither aborted nor open-failed", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    // #toApiError has a second, independent site producing this same code string — its
    // catch-all for a cause that is neither UserAborted nor WorkspaceOpenError.
    flows.mockReturnValueOnce(AsyncResult.err(new Error("boom")));

    await expect(api.ensureNote("daily", "2026-08-18")).rejects.toMatchObject({ code: "creation-failed" });
  });

  it("shows the picker when several journals match, and uses the choice", async () => {
    const { api, harness } = await buildApi({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });

    const pending = api.ensureNote({ writeType: "day" }, "2026-08-18");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.suggests.opens).toHaveLength(1);
    expect(harness.suggests.lastOpen<string[], string>().input).toEqual(["a", "b"]);
    harness.suggests.lastOpen<string[], string>().choose("b");
    const result = await pending;

    expect(result.note.journal).toBe("b");
  });

  it("rejects with aborted when the user dismisses the picker", async () => {
    const { api, harness } = await buildApi({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });

    const pending = api.ensureNote({ writeType: "day" }, "2026-08-18");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    harness.suggests.lastOpen<string[], string>().cancel();

    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("passes skipConfirmation only when confirm is given", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api.ensureNote("daily", "2026-08-18", { confirm: false });
    expect(flows.mock.calls.at(-1)?.[1]).toMatchObject({ skipConfirmation: true });

    await api.ensureNote("daily", "2026-08-19");
    expect((flows.mock.calls.at(-1)?.[1] as { skipConfirmation?: boolean }).skipConfirmation).toBeUndefined();
  });

  it("shares one flow invocation between concurrent calls for the same period", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const [first, second] = await Promise.all([
      api.ensureNote("daily", "2026-08-18"),
      api.ensureNote("daily", "2026-08-18"),
    ]);

    expect(flows).toHaveBeenCalledTimes(1);
    expect(first.note.path).toBe(second.note.path);
  });

  it("still pins when an unpinned open of the same period is already running", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([api.openNote("daily", "2026-08-18"), api.openNote("daily", "2026-08-18", { pinned: true })]);

    const opens = flows.mock.calls
      .filter(([flow]) => flow === OpenJournalEntryFlow)
      .map(([, parameters]) => parameters);
    expect(opens).toEqual([expect.objectContaining({ pinned: undefined }), expect.objectContaining({ pinned: true })]);
  });

  it("shares a running open with an identical one queued behind a different open", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([
      api.openNote("daily", "2026-08-18", { openMode: "tab" }),
      api.openNote("daily", "2026-08-18", { pinned: true }),
      api.openNote("daily", "2026-08-18", { openMode: "tab" }),
    ]);

    const opens = flows.mock.calls.filter(([flow]) => flow === OpenJournalEntryFlow);
    expect(opens).toHaveLength(2);
  });

  it("shares a running open with one spelling out the same defaults", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([
      api.openNote("daily", "2026-08-18", { openMode: "tab" }),
      api.openNote("daily", "2026-08-18", { openMode: "tab", prompt: true, pinned: false }),
    ]);

    expect(flows.mock.calls.filter(([flow]) => flow === OpenJournalEntryFlow)).toHaveLength(1);
  });

  it("does not share a running ensure with one asking for different prompting", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([
      api.ensureNote("daily", "2026-08-18"),
      api.ensureNote("daily", "2026-08-18", { prompt: false }),
    ]);

    expect(flows.mock.calls.map(([, parameters]) => parameters)).toEqual([
      expect.objectContaining({ unattended: false }),
      expect.objectContaining({ unattended: true }),
    ]);
  });

  it("still opens when an ensure of the same period is already running", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([api.ensureNote("daily", "2026-08-18"), api.openNote("daily", "2026-08-18")]);

    expect(flows.mock.calls.map(([flow]) => flow)).toEqual([EnsureJournalEntryFlow, OpenJournalEntryFlow]);
  });

  it("does not share invocations across different periods", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([api.ensureNote("daily", "2026-08-18"), api.ensureNote("daily", "2026-08-19")]);

    expect(flows).toHaveBeenCalledTimes(2);
  });

  // The dedupe key's answers segment: two calls for the same period with different answers must
  // not collapse onto one shared flow run, or the second's answers would never even be evaluated.
  // Each still runs its own EnsureJournalEntryFlow — #dedupe queues the second run behind the
  // first's promise (`settled.then(run)`), so by the time it starts, NoteCreationService has
  // already registered the first's note in the index. The second's own entryByAnchor check then
  // finds that note already there and reuses it, the same as reopening an existing note; its
  // differing answers are not applied. See "does not create a second note when concurrent calls
  // answer the note name differently" under `JournalsApiService answers`.
  it("does not share a running ensure with one asking for different answers", async () => {
    const { api, flows } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], nameTemplate: "{{date}} {{mood}}" }),
    });

    const [first, second] = await Promise.all([
      api.ensureNote("daily", "2026-08-18", { answers: { mood: "good" } }),
      api.ensureNote("daily", "2026-08-18", { answers: { mood: "bad" } }),
    ]);

    expect(flows.mock.calls.filter(([flow]) => flow === EnsureJournalEntryFlow)).toHaveLength(2);
    expect(second.note.path).toBe(first.note.path);
  });

  it("creates with no modal when confirm and empty answers are both passed on a confirming journal", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }),
    });

    const result = await api.ensureNote("daily", "2026-08-18", { confirm: true, answers: {} });

    expect(result.created).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });
});

describe("JournalsApiService notelet creation", () => {
  it("creates a notelet through the flow and reports it", async () => {
    const { api, flows } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });

    const note = await api.createNotelet("weekly", "2026-08-19", "Meeting");

    expect(note).toMatchObject({ journal: "weekly", type: "Meeting", date: "2026-08-17", counter: 1 });
    expect(note.file).not.toBeNull();
    expect(flows).toHaveBeenLastCalledWith(CreateNoteletFlow, expect.anything(), expect.anything());
  });

  it("passes skipConfirmation only when confirm is given", async () => {
    const { api, flows } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });

    await api.createNotelet("weekly", "2026-08-19", "Meeting", { confirm: false });
    expect(flows.mock.calls.at(-1)?.[1]).toMatchObject({ skipConfirmation: true });

    await api.createNotelet("weekly", "2026-08-19", "Meeting");
    expect((flows.mock.calls.at(-1)?.[1] as { skipConfirmation?: boolean }).skipConfirmation).toBeUndefined();
  });

  it("does not open the notelet unless a mode is asked for", async () => {
    const { api, harness } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    const open = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    await api.createNotelet("weekly", "2026-08-19", "Meeting");

    expect(open).not.toHaveBeenCalled();
  });

  it("opens the notelet in the mode it was given", async () => {
    const { api, harness } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    const open = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    await api.createNotelet("weekly", "2026-08-19", "Meeting", { openMode: "split" });

    expect(open).toHaveBeenCalledWith(expect.any(String), "split");
  });

  it("invokes the creation flow once per call rather than deduping", async () => {
    const { api, flows } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });

    await Promise.allSettled([
      api.createNotelet("weekly", "2026-08-19", "Meeting"),
      api.createNotelet("weekly", "2026-08-19", "Meeting"),
    ]);

    const invocations = flows.mock.calls.filter(([flow]) => flow === CreateNoteletFlow);
    expect(invocations).toHaveLength(2);
  });

  it("fails with notelet-type-not-found for a name the journal does not own", async () => {
    const { api, flows } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });

    await expect(api.createNotelet("weekly", "2026-08-19", "Nope")).rejects.toMatchObject({
      code: "notelet-type-not-found",
      journal: "weekly",
    });
    expect(flows).not.toHaveBeenCalledWith(CreateNoteletFlow, expect.anything(), expect.anything());
  });

  it("fails with journal-not-found for a journal that does not exist", async () => {
    const { api } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });

    await expect(api.createNotelet("nope", "2026-08-19", "Meeting")).rejects.toMatchObject({
      code: "journal-not-found",
    });
  });

  it("fails with outside-timeline for a date the journal's timeline excludes", async () => {
    const { api } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "week" },
        {
          notelets: { nt_meeting: meeting },
          timeline: {
            start: "2020-01-01" as AnchorString,
            end: { kind: "date", date: "2020-12-31" as AnchorString },
          },
        },
      ),
    });

    await expect(api.createNotelet("past", "2026-08-19", "Meeting")).rejects.toMatchObject({
      code: "outside-timeline",
    });
  });

  it("refuses before the flow when a period note exists outside the timeline", async () => {
    const { api, index, harness, flows } = await buildApi({
      past: fixedJournal(
        "past",
        { type: "week" },
        {
          notelets: { nt_meeting: meeting },
          timeline: {
            start: "2020-01-01" as AnchorString,
            end: { kind: "date", date: "2020-12-31" as AnchorString },
          },
        },
      ),
    });
    harness.host.putFile("Past/2026-08-17.md", "existing");
    index.register({
      journalName: "past",
      anchor: "2026-08-17" as AnchorString,
      path: "Past/2026-08-17.md" as VaultPath,
    });

    await expect(api.createNotelet("past", "2026-08-19", "Meeting")).rejects.toMatchObject({
      code: "outside-timeline",
    });
    expect(flows).not.toHaveBeenCalledWith(CreateNoteletFlow, expect.anything(), expect.anything());
  });

  it("asks the type's prompts by default", async () => {
    const { api, harness } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: {
            nt_meeting: buildNoteletType({ id: "nt_meeting" as TypeId, name: "Meeting", prompts: [mood] }),
          },
        },
      ),
    });

    const pending = api.createNotelet("weekly", "2026-08-19", "Meeting");
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });

    await expect(pending).resolves.toMatchObject({ type: "Meeting" });
  });

  it("fails with prompts-required when prompt:false and an answer reaches the note name", async () => {
    const { api, harness } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: {
            nt_meeting: buildNoteletType({
              id: "nt_meeting" as TypeId,
              name: "Meeting",
              prompts: [mood],
              nameTemplate: "{{journal_name}} {{mood}}",
            }),
          },
        },
      ),
    });

    await expect(api.createNotelet("weekly", "2026-08-19", "Meeting", { prompt: false })).rejects.toMatchObject({
      code: "prompts-required",
    });
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("fails with notelet-type-not-found when the type is deleted while the prompt modal is open", async () => {
    const { api, harness, repo } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: {
            nt_meeting: buildNoteletType({ id: "nt_meeting" as TypeId, name: "Meeting", prompts: [mood] }),
          },
        },
      ),
    });

    const pending = api.createNotelet("weekly", "2026-08-19", "Meeting");
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    repo.deleteNoteletType("weekly", "nt_meeting" as TypeId);
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });

    await expect(pending).rejects.toMatchObject({
      code: "notelet-type-not-found",
      message: "Notelet type not found in weekly: nt_meeting",
    });
  });
});

async function createdNotelet(): Promise<{
  api: JournalsApiService;
  harness: Awaited<ReturnType<typeof buildApi>>["harness"];
  note: NoteletNote;
}> {
  const { api, harness } = await buildApi({
    weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
  });
  const note = await api.createNotelet("weekly", "2026-08-19", "Meeting");
  return { api, harness, note };
}

describe("JournalsApiService notelet opening", () => {
  it("opens through the workspace, in the active pane by default", async () => {
    const { api, harness, note } = await createdNotelet();
    const open = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    await api.openNotelet(note);

    expect(open).toHaveBeenCalledWith(note.path, "active");
  });

  it("honors the requested mode", async () => {
    const { api, harness, note } = await createdNotelet();
    const open = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    await api.openNotelet(note, { openMode: "window" });

    expect(open).toHaveBeenCalledWith(note.path, "window");
  });

  it("fails with open-failed when the file is gone", async () => {
    const { api, harness, note } = await createdNotelet();
    vi.spyOn(harness.resolve(WorkspaceService), "openNote").mockReturnValueOnce(
      AsyncResult.err(new WorkspaceOpenError(note.path as VaultPath, new Error("not a file"))),
    );

    await expect(api.openNotelet(note)).rejects.toMatchObject({ code: "open-failed", journal: "weekly" });
  });

  it("refuses after the plugin is unloaded", async () => {
    const { api, note } = await createdNotelet();

    await api[Symbol.asyncDispose]();

    await expect(api.openNotelet(note)).rejects.toMatchObject({ code: "plugin-unloaded" });
  });
});

describe("JournalsApiService creation prompts", () => {
  it("asks by default on a prompting journal", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }),
    });

    const pending = api.ensureNote("daily", "2026-08-18");
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });

    const result = await pending;
    expect(result.created).toBe(true);
  });

  it("fails with prompts-required when prompt:false and an answer reaches the note name", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], nameTemplate: "{{date}} {{mood}}" }),
    });

    await expect(api.ensureNote("daily", "2026-08-18", { prompt: false })).rejects.toMatchObject({
      code: "prompts-required",
    });
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("fails with prompts-required when prompt:false and a prompt is required", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [{ ...mood, required: true }] }),
    });

    await expect(api.ensureNote("daily", "2026-08-18", { prompt: false })).rejects.toMatchObject({
      code: "prompts-required",
    });
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("creates the note unattended when only optional, out-of-path prompts remain", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }),
    });

    const result = await api.ensureNote("daily", "2026-08-18", { prompt: false });

    expect(result.created).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });

  // openNote reaches a different flow than ensureNote and only shares #unattended and
  // #toApiError with it, so each arm is asserted against it too rather than by inspection.
  it("asks by default on a prompting journal when opening", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }),
    });

    const pending = api.openNote("daily", "2026-08-18");
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });

    const result = await pending;
    expect(result.created).toBe(true);
  });

  it("fails openNote with prompts-required when prompt:false and an answer reaches the note name", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], nameTemplate: "{{date}} {{mood}}" }),
    });

    await expect(api.openNote("daily", "2026-08-18", { prompt: false })).rejects.toMatchObject({
      code: "prompts-required",
    });
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("fails openNote with prompts-required when prompt:false and a prompt is required", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [{ ...mood, required: true }] }),
    });

    await expect(api.openNote("daily", "2026-08-18", { prompt: false })).rejects.toMatchObject({
      code: "prompts-required",
    });
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("opens the note unattended when only optional, out-of-path prompts remain", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }),
    });

    const result = await api.openNote("daily", "2026-08-18", { prompt: false });

    expect(result.created).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });
});

describe("JournalsApiService events", () => {
  it("reports a rename with both names", async () => {
    const { api, repo } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    const seen: { from: string; to: string }[] = [];
    api.on("journalRenamed", (event) => {
      seen.push(event);
    });

    repo.rename("daily", "journal");

    expect(seen).toEqual([{ from: "daily", to: "journal" }]);
  });

  it("reports an added note by date", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    const seen: { journal: string; date: string; path: string; reason: string; canonical: boolean }[] = [];
    api.on("noteAdded", (event) => {
      seen.push(event);
    });

    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });

    expect(seen).toEqual([
      { journal: "daily", date: "2026-08-18", path: "Journal/2026-08-18.md", reason: "appeared", canonical: true },
    ]);
  });

  it("reports a removed note", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });
    const seen: { journal: string; date: string }[] = [];
    api.on("noteRemoved", (event) => {
      seen.push({ journal: event.journal, date: event.date });
    });

    index.unregister("Journal/2026-08-18.md" as VaultPath);

    expect(seen).toEqual([{ journal: "daily", date: "2026-08-18" }]);
  });

  it("stops delivering after the disposer runs", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    let calls = 0;
    const off = api.on("noteAdded", () => {
      calls += 1;
    });

    off();
    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });

    expect(calls).toBe(0);
  });

  it("reports an added notelet with its type", async () => {
    const { api, index } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: { nt_meeting: buildNoteletType({ id: "nt_meeting" as TypeId, name: "Meeting" }) },
        },
      ),
    });
    const seen: { journal: string; date: string; type: string; path: string; reason: string; canonical: boolean }[] =
      [];
    api.on("noteletAdded", (event) => {
      seen.push(event);
    });

    index.register({
      kind: "notelet",
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });

    expect(seen).toEqual([
      {
        journal: "weekly",
        date: "2026-08-17",
        type: "Meeting",
        path: "Journal/Meeting 1.md",
        reason: "appeared",
        canonical: true,
      },
    ]);
  });

  it("reports a removed notelet", async () => {
    const { api, index } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });
    index.register({
      kind: "notelet",
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
    });
    const seen: { journal: string; type: string }[] = [];
    api.on("noteletRemoved", (event) => {
      seen.push({ journal: event.journal, type: event.type });
    });

    index.unregister("Journal/Meeting 1.md" as VaultPath);

    expect(seen).toEqual([{ journal: "weekly", type: "Meeting" }]);
  });

  it("does not deliver a notelet to noteAdded", async () => {
    const { api, index } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });
    const periodNotes: string[] = [];
    const notelets: string[] = [];
    api.on("noteAdded", (event) => {
      periodNotes.push(event.path);
    });
    api.on("noteletAdded", (event) => {
      notelets.push(event.path);
    });

    index.register({
      kind: "notelet",
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
    });

    expect(notelets).toEqual(["Journal/Meeting 1.md"]);
    expect(periodNotes).toEqual([]);
  });

  it("does not deliver a period note to noteletAdded", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    const seen: string[] = [];
    api.on("noteletAdded", (event) => {
      seen.push(event.path);
    });

    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });

    expect(seen).toEqual([]);
  });

  it("keeps note and notelet add/remove events each to their own kind", async () => {
    const { api, index } = await buildApi({
      weekly: fixedJournal("weekly", { type: "week" }, { notelets: { nt_meeting: meeting } }),
    });
    const notesAdded: string[] = [];
    const notesRemoved: string[] = [];
    const noteletsAdded: string[] = [];
    const noteletsRemoved: string[] = [];
    api.on("noteAdded", (event) => {
      notesAdded.push(event.path);
    });
    api.on("noteRemoved", (event) => {
      notesRemoved.push(event.path);
    });
    api.on("noteletAdded", (event) => {
      noteletsAdded.push(event.path);
    });
    api.on("noteletRemoved", (event) => {
      noteletsRemoved.push(event.path);
    });

    index.register({
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/2026-08-17.md" as VaultPath,
    });
    index.register({
      kind: "notelet",
      journalName: "weekly",
      anchor: "2026-08-17" as AnchorString,
      path: "Journal/Meeting 1.md" as VaultPath,
      typeName: "Meeting",
      typeId: "nt_meeting" as TypeId,
      counter: 1,
    });
    index.unregister("Journal/2026-08-17.md" as VaultPath);
    index.unregister("Journal/Meeting 1.md" as VaultPath);

    expect(notesAdded).toEqual(["Journal/2026-08-17.md"]);
    expect(notesRemoved).toEqual(["Journal/2026-08-17.md"]);
    expect(noteletsAdded).toEqual(["Journal/Meeting 1.md"]);
    expect(noteletsRemoved).toEqual(["Journal/Meeting 1.md"]);
  });
});

function claim(date: string) {
  return { journal: "daily", "journal-date": date };
}

async function bootApi(seed?: (host: TestHarness["host"]) => void) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
    data: {
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { notelets: { nt_meeting: meeting }, prompts: [mood] }),
      },
      shelves: {},
    },
  });
  const api = harness.resolve(JournalsApiService);
  const added: { path: string; reason: string; canonical: boolean }[] = [];
  const removed: { path: string; reason: string }[] = [];
  const noteletsAdded: { path: string; reason: string; canonical: boolean }[] = [];
  api.on("noteAdded", ({ path, reason, canonical }) => {
    added.push({ path, reason, canonical });
  });
  api.on("noteRemoved", ({ path, reason }) => {
    removed.push({ path, reason });
  });
  api.on("noteletAdded", ({ path, reason, canonical }) => {
    noteletsAdded.push({ path, reason, canonical });
  });
  seed?.(harness.host);
  await harness.resolve(VaultSubscriptionService).initialize();
  return { harness, api, added, removed, noteletsAdded };
}

describe("JournalsApiService event reasons", () => {
  it("marks every note the startup walk finds as indexed", async () => {
    const { added } = await bootApi((host) => {
      host.putFile("D/2026-08-17.md", "", claim("2026-08-17"));
      host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    });

    expect(added).toEqual([
      { path: "D/2026-08-17.md", reason: "indexed", canonical: true },
      { path: "D/2026-08-18.md", reason: "indexed", canonical: true },
    ]);
  });

  it("marks an existing note whose metadata resolves during startup as indexed, not appeared", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) }, shelves: {} },
    });
    const imported = harness.host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    const cache = harness.host.app.metadataCache;
    const read = cache.getFileCache.bind(cache);
    const unparsed = vi
      .spyOn(cache, "getFileCache")
      .mockImplementation((file) => (file === imported ? null : read(file)));
    const batches: (() => void)[] = [];
    vi.spyOn(harness.resolve(NoteMetadataService), "onResolved").mockImplementation((callback) => {
      batches.push(callback);
      return () => void batches.splice(batches.indexOf(callback), 1);
    });
    const added: { path: string; reason: string }[] = [];
    harness.resolve(JournalsApiService).on("noteAdded", ({ path, reason }) => {
      added.push({ path, reason });
    });
    await harness.resolve(VaultSubscriptionService).initialize();

    unparsed.mockImplementation(read);
    harness.host.emitMetadata("D/2026-08-18.md");
    for (const batch of batches.splice(0)) batch();

    expect(added).toEqual([{ path: "D/2026-08-18.md", reason: "indexed" }]);
  });

  it("marks a note created after layout-ready as appeared while another note is still unresolved", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, apiModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) }, shelves: {} },
    });
    const pending = harness.host.putFile("D/2026-08-17.md", "", claim("2026-08-17"));
    const cache = harness.host.app.metadataCache;
    const read = cache.getFileCache.bind(cache);
    const unparsed = vi
      .spyOn(cache, "getFileCache")
      .mockImplementation((file) => (file === pending ? null : read(file)));
    const batches: (() => void)[] = [];
    vi.spyOn(harness.resolve(NoteMetadataService), "onResolved").mockImplementation((callback) => {
      batches.push(callback);
      return () => void batches.splice(batches.indexOf(callback), 1);
    });
    const added: { path: string; reason: string }[] = [];
    harness.resolve(JournalsApiService).on("noteAdded", ({ path, reason }) => {
      added.push({ path, reason });
    });
    await harness.resolve(VaultSubscriptionService).initialize();

    const arrived = harness.host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    harness.host.emitVault("create", arrived);
    harness.host.emitMetadata("D/2026-08-18.md");
    unparsed.mockImplementation(read);
    for (const batch of batches.splice(0)) batch();

    expect(added).toEqual([
      { path: "D/2026-08-18.md", reason: "appeared" },
      { path: "D/2026-08-17.md", reason: "indexed" },
    ]);
  });

  it("marks a note that shows up after startup as appeared", async () => {
    const { harness, added } = await bootApi();

    harness.host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    harness.host.emitMetadata("D/2026-08-18.md");

    expect(added).toEqual([{ path: "D/2026-08-18.md", reason: "appeared", canonical: true }]);
  });

  it("marks an existing note a journal created after startup picks up as indexed", async () => {
    const { harness, added } = await bootApi((host) => {
      host.putFile("M/2026-08.md", "", { journal: "monthly", "journal-date": "2026-08-01" });
    });

    harness.resolve(JournalsRepository).create("monthly", { type: "month" });

    expect(added).toEqual([{ path: "M/2026-08.md", reason: "indexed", canonical: true }]);
  });

  it("marks a note Journals creates as created", async () => {
    const { api, added } = await bootApi();

    const { note } = await api.ensureNote("daily", "2026-08-18", { prompt: false, confirm: false });

    expect(added).toEqual([{ path: note.path, reason: "created", canonical: true }]);
  });

  it("marks an existing file Journals claims as appeared, not created", async () => {
    const { harness, api, added } = await bootApi();
    const [planned] = await api.notesFor("daily", "2026-08-18");
    if (planned?.path == null) throw new Error("no planned path");
    harness.host.putFile(planned.path, "my own words");

    const { created } = await api.ensureNote("daily", "2026-08-18", { prompt: false, confirm: false });

    expect(created).toBe(false);
    expect(added).toEqual([{ path: planned.path, reason: "appeared", canonical: true }]);
  });

  it("marks a re-dated note's remove and add as changed", async () => {
    const { harness, added, removed } = await bootApi((host) => {
      host.putFile("D/note.md", "", claim("2026-08-17"));
    });
    added.length = 0;

    harness.host.putFile("D/note.md", "", claim("2026-08-18"));
    harness.host.emitMetadata("D/note.md");

    expect(removed).toEqual([{ path: "D/note.md", reason: "changed" }]);
    expect(added).toEqual([{ path: "D/note.md", reason: "changed", canonical: true }]);
  });

  it("marks an edit to a tracked field as changed, with nothing removed", async () => {
    const { harness, added, removed } = await bootApi((host) => {
      host.putFile("D/2026-08-18.md", "", { ...claim("2026-08-18"), mood: "calm" });
    });
    added.length = 0;

    harness.host.putFile("D/2026-08-18.md", "", { ...claim("2026-08-18"), mood: "tired" });
    harness.host.emitMetadata("D/2026-08-18.md");

    expect(removed).toEqual([]);
    expect(added).toEqual([{ path: "D/2026-08-18.md", reason: "changed", canonical: true }]);
  });

  it("marks a rename's remove and add as moved", async () => {
    const { harness, added, removed } = await bootApi((host) => {
      host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    });
    added.length = 0;
    const file = harness.host.app.vault.getAbstractFileByPath("D/2026-08-18.md");
    if (!(file instanceof TFile)) throw new TypeError("no file");

    await harness.host.app.vault.rename(file, "D/renamed.md");

    expect(removed).toEqual([{ path: "D/2026-08-18.md", reason: "moved" }]);
    expect(added).toEqual([{ path: "D/renamed.md", reason: "moved", canonical: true }]);
  });

  it("marks a deleted note's removal as deleted", async () => {
    const { harness, removed } = await bootApi((host) => {
      host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    });
    const file = harness.host.app.vault.getAbstractFileByPath("D/2026-08-18.md");
    if (!(file instanceof TFile)) throw new TypeError("no file");

    await harness.host.app.fileManager.trashFile(file);

    expect(removed).toEqual([{ path: "D/2026-08-18.md", reason: "deleted" }]);
  });

  it("marks a note that loses its claim as unindexed", async () => {
    const { harness, removed } = await bootApi((host) => {
      host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    });

    harness.host.putFile("D/2026-08-18.md", "", {});
    harness.host.emitMetadata("D/2026-08-18.md");

    expect(removed).toEqual([{ path: "D/2026-08-18.md", reason: "unindexed" }]);
  });

  it("marks a second note for an occupied date as not canonical", async () => {
    const { harness, added } = await bootApi((host) => {
      host.putFile("D/2026-08-18.md", "", claim("2026-08-18"));
    });
    added.length = 0;

    harness.host.putFile("D/2026-08-18 (conflict).md", "", claim("2026-08-18"));
    harness.host.emitMetadata("D/2026-08-18 (conflict).md");

    expect(added).toEqual([{ path: "D/2026-08-18 (conflict).md", reason: "appeared", canonical: false }]);
  });

  it("marks a notelet Journals creates as created", async () => {
    const { api, noteletsAdded } = await bootApi();

    const notelet = await api.createNotelet("daily", "2026-08-18", "Meeting", { prompt: false, confirm: false });

    expect(noteletsAdded).toEqual([{ path: notelet.path, reason: "created", canonical: true }]);
  });

  it("never reports the settings preview's synthetic entry", async () => {
    const { harness, added, removed } = await bootApi();
    const Host = defineComponent({
      template: "<div />",
      setup() {
        useCodeBlockPreviewPath("daily");
      },
    });

    harness.render(Host).unmount();

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });
});

describe("JournalsApiService unloading", () => {
  it("rejects an in-flight call with plugin-unloaded", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) }, { ready: false });
    const pending = api.notesFor("daily", "2026-08-18");

    await api[Symbol.asyncDispose]();

    await expect(pending).rejects.toMatchObject({ code: "plugin-unloaded" });
  });

  it("rejects calls made after disposal", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api[Symbol.asyncDispose]();

    await expect(api.notesFor("daily", "2026-08-18")).rejects.toMatchObject({ code: "plugin-unloaded" });
  });

  it("rejects notelet calls made after disposal", async () => {
    const { api } = await buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });

    await api[Symbol.asyncDispose]();

    await expect(api.noteletsFor("weekly", "2026-08-18")).rejects.toMatchObject({ code: "plugin-unloaded" });
    await expect(api.createNotelet("weekly", "2026-08-18", "Meeting")).rejects.toMatchObject({
      code: "plugin-unloaded",
    });
    await expect(api.noteletOf({ path: "Journal/Meeting 1.md" })).rejects.toMatchObject({
      code: "plugin-unloaded",
    });
  });
});

describe("JournalsApiService answers", () => {
  const who: Prompt = { variable: "who", question: "Who?", type: "note", frontmatterKey: "who", required: false };
  const due: Prompt = {
    variable: "due",
    question: "Due?",
    type: "date",
    frontmatterKey: "due",
    required: false,
    format: "DD.MM.YYYY",
  };

  it("creates a note named by its answers without asking", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], nameTemplate: "{{date}} {{mood}}" }),
    });

    const result = await api.ensureNote("daily", "2026-08-18", { answers: { mood: "good" } });

    expect(result).toMatchObject({ created: true, note: { path: "2026-08-18 good.md" } });
    expect(harness.host.files.get("2026-08-18 good.md")?.frontmatter).toMatchObject({ mood: "good" });
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("does not create a second note when concurrent calls answer the note name differently", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], nameTemplate: "{{date}} {{mood}}" }),
    });

    const [first, second] = await Promise.all([
      api.ensureNote("daily", "2026-08-18", { answers: { mood: "good" } }),
      api.ensureNote("daily", "2026-08-18", { answers: { mood: "bad" } }),
    ]);

    expect([first.created, second.created].toSorted()).toEqual([false, true]);
    expect(second.note.path).toBe(first.note.path);
    expect([...harness.host.files.keys()].filter((p) => p.startsWith("2026-08-18"))).toHaveLength(1);
  });

  it("rejects with invalid-answers listing every problem, and creates nothing", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [{ ...mood, required: true }, due] }),
    });

    const call = api.ensureNote("daily", "2026-08-18", { answers: { due: "18.08.2026", typo: 1 } });

    await expect(call).rejects.toMatchObject({
      code: "invalid-answers",
      journal: "daily",
      issues: expect.arrayContaining([
        expect.objectContaining({ variable: "mood" }),
        expect.objectContaining({ variable: "due" }),
        expect.objectContaining({ variable: "typo" }),
      ]) as unknown,
    });
    expect(harness.host.files.has("2026-08-18.md")).toBe(false);
  });

  it("stores a date answer as the ISO date given", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [due] }) });

    await api.ensureNote("daily", "2026-08-18", { answers: { due: "2026-09-01" } });

    expect(harness.host.files.get("2026-08-18.md")?.frontmatter).toMatchObject({ due: "2026-09-01" });
  });

  it("turns a note answer's path into a link", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [who] }) });
    harness.host.putFile("People/Ann.md", "");

    await api.ensureNote("daily", "2026-08-18", { answers: { who: "People/Ann.md" } });

    expect(harness.host.files.get("2026-08-18.md")?.frontmatter).toMatchObject({ who: ["[[Ann]]"] });
  });

  it("rejects a note answer whose path has no file", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [who] }) });

    await expect(api.ensureNote("daily", "2026-08-18", { answers: { who: "People/Bob.md" } })).rejects.toMatchObject({
      code: "invalid-answers",
      issues: [expect.objectContaining({ variable: "who" }) as unknown],
    });
  });

  it("skips the creation confirmation when answers are supplied", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }),
    });

    const result = await api.ensureNote("daily", "2026-08-18", { answers: {} });

    expect(result.created).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("checks answers even when the note already exists, then leaves the note as it is", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });
    await api.ensureNote("daily", "2026-08-18", { answers: { mood: "good" } });

    await expect(api.ensureNote("daily", "2026-08-18", { answers: { mood: 5 } })).rejects.toMatchObject({
      code: "invalid-answers",
    });
    await expect(api.ensureNote("daily", "2026-08-18", { answers: { mood: "bad" } })).resolves.toMatchObject({
      created: false,
    });
  });

  it("opens a note named by its answers", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [mood], nameTemplate: "{{date}} {{mood}}" }),
    });

    const result = await api.openNote("daily", "2026-08-18", { answers: { mood: "good" } });

    expect(result.note.path).toBe("2026-08-18 good.md");
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("creates a notelet named by its answers", async () => {
    const { api, harness } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          notelets: {
            nt_meeting: buildNoteletType({
              id: "nt_meeting" as TypeId,
              name: "Meeting",
              nameTemplate: "Meeting {{mood}}",
              prompts: [mood],
            }),
          },
        },
      ),
    });

    const notelet = await api.createNotelet("weekly", "2026-08-19", "Meeting", { answers: { mood: "calm" } });

    expect(notelet.path).toMatch(/Meeting calm\.md$/);
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("checks a notelet's answers against its type's questions, not the journal's", async () => {
    const { api } = await buildApi({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        {
          prompts: [mood],
          notelets: { nt_meeting: buildNoteletType({ id: "nt_meeting" as TypeId, name: "Meeting" }) },
        },
      ),
    });

    await expect(
      api.createNotelet("weekly", "2026-08-19", "Meeting", { answers: { mood: "calm" } }),
    ).rejects.toMatchObject({
      code: "invalid-answers",
      issues: [expect.objectContaining({ variable: "mood" }) as unknown],
    });
  });

  it("describes questions through listJournals", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });

    const [info] = await api.listJournals();

    expect(info?.prompts.map((prompt) => prompt.variable)).toEqual(["mood"]);
  });

  it("treats a null answers bag as absent on a journal with no prompts", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18", { answers: null as unknown as Record<string, never> });

    expect(result.created).toBe(true);
    expect(harness.host.files.has("2026-08-18.md")).toBe(true);
  });

  // #answers must map null to undefined, not {}: an empty answers bag skips a confirming
  // journal's confirmation modal (see "creates with no modal when confirm and empty answers
  // are both passed on a confirming journal"), while undefined leaves the flow's own default
  // in place, which still asks. That difference is what this test pins.
  it("still opens the creation confirmation when answers is null on a confirming journal", async () => {
    const { api, harness } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }),
    });

    const pending = api.ensureNote("daily", "2026-08-18", { answers: null as unknown as Record<string, never> });
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<unknown, boolean>().submit(true);

    const result = await pending;
    expect(result.created).toBe(true);
  });

  it("treats a null answers bag the same as none on a journal with a required prompt", async () => {
    const { api } = await buildApi({
      daily: fixedJournal("daily", { type: "day" }, { prompts: [{ ...mood, required: true }] }),
    });

    await expect(
      api.ensureNote("daily", "2026-08-18", {
        prompt: false,
        answers: null as unknown as Record<string, never>,
      }),
    ).rejects.toMatchObject({ code: "prompts-required" });
  });

  it("rejects a non-object answers value with a single invalid-answers issue", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(
      api.ensureNote("daily", "2026-08-18", { answers: "abc" as unknown as Record<string, never> }),
    ).rejects.toMatchObject({
      code: "invalid-answers",
      issues: [expect.objectContaining({ variable: "" }) as unknown],
    });
  });

  it("rejects an array answers value with a single invalid-answers issue", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(
      api.ensureNote("daily", "2026-08-18", { answers: ["x"] as unknown as Record<string, never> }),
    ).rejects.toMatchObject({
      code: "invalid-answers",
      issues: [expect.objectContaining({ variable: "" }) as unknown],
    });
  });

  it("rejects a Date as answers, creating nothing and opening no modal", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });

    await expect(
      api.ensureNote("daily", "2026-08-18", { answers: new Date() as unknown as Record<string, never> }),
    ).rejects.toMatchObject({ code: "invalid-answers" });
    expect(harness.host.files.has("2026-08-18.md")).toBe(false);
    expect(harness.modals.opens).toHaveLength(0);
  });

  it("rejects a class instance as answers", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });
    class AnswersBag {
      mood = "good";
    }

    await expect(
      api.ensureNote("daily", "2026-08-18", { answers: new AnswersBag() as unknown as Record<string, never> }),
    ).rejects.toMatchObject({ code: "invalid-answers" });
  });

  it("accepts a null-prototype object as answers", async () => {
    const { api, harness } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });
    const answers: Record<string, unknown> = Object.assign(Object.create(null) as Record<string, unknown>, {
      mood: "good",
    });

    const result = await api.ensureNote("daily", "2026-08-18", { answers });

    expect(result.created).toBe(true);
    expect(harness.host.files.get("2026-08-18.md")?.frontmatter).toMatchObject({ mood: "good" });
  });

  it("rejects a getter for a question's variable, with an issue naming it", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });
    const answers: Record<string, unknown> = {};
    Object.defineProperty(answers, "mood", { get: () => "good", enumerable: true, configurable: true });

    await expect(api.ensureNote("daily", "2026-08-18", { answers })).rejects.toMatchObject({
      code: "invalid-answers",
      issues: [expect.objectContaining({ variable: "mood" }) as unknown],
    });
  });

  it("rejects a Proxy whose ownKeys trap throws, as invalid-answers rather than a raw error", async () => {
    const { api } = await buildApi({ daily: fixedJournal("daily", { type: "day" }, { prompts: [mood] }) });
    const answers = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("boom");
        },
      },
    );

    await expect(api.ensureNote("daily", "2026-08-18", { answers })).rejects.toMatchObject({
      code: "invalid-answers",
    });
  });
});
