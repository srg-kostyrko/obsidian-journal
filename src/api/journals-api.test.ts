import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { Flows } from "@/infrastructure/flows";
import { NotesService, WorkspaceOpenError, WorkspaceService } from "@/infrastructure/host";
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
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import type { NoteletEntry } from "@/journals/types";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

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
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals, shelves: options.shelves ?? {} },
    initialize: options.ready === false ? [] : [VaultSubscriptionService],
  });
  const api = harness.resolve(JournalsApiService);
  const index = harness.resolve(JournalsIndex);
  const repo = harness.resolve(JournalsRepository);
  const flows = vi.spyOn(harness.resolve(Flows), "invoke");
  return { harness, api, index, repo, flows };
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

describe("JournalsApiService writes", () => {
  it("creates the note through the ensure flow and reports created", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18");

    expect(result.created).toBe(true);
    expect(result.note.journal).toBe("daily");
    expect(result.note.file).not.toBeNull();
    expect(flows).toHaveBeenLastCalledWith(EnsureJournalEntryFlow, expect.anything(), expect.anything());
  });

  it("returns the created note before the index has caught up", async () => {
    const { api, index } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18");

    expect(index.entryByAnchor("daily", "2026-08-18" as AnchorString).isNone()).toBe(true);
    expect(result.note.path).toBe("2026-08-18.md");
    // The index is still empty, and a lookup reports `file: null` for a note it does not know
    // yet — so a non-null file is what proves the result came from the write. The path cannot
    // prove it: a lookup renders the same path from the same template on the same miss.
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

  it("does not share invocations across different periods", async () => {
    const { api, flows } = await buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([api.ensureNote("daily", "2026-08-18"), api.ensureNote("daily", "2026-08-19")]);

    expect(flows).toHaveBeenCalledTimes(2);
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
    const seen: { journal: string; date: string; path: string }[] = [];
    api.on("noteAdded", (event) => {
      seen.push(event);
    });

    index.register({
      journalName: "daily",
      anchor: "2026-08-18" as AnchorString,
      path: "Journal/2026-08-18.md" as VaultPath,
    });

    expect(seen).toEqual([{ journal: "daily", date: "2026-08-18", path: "Journal/2026-08-18.md" }]);
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
    const seen: { journal: string; date: string; type: string; path: string }[] = [];
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

    expect(seen).toEqual([{ journal: "weekly", date: "2026-08-17", type: "Meeting", path: "Journal/Meeting 1.md" }]);
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
