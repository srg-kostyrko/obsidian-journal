import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceOpenError, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";
import { AsyncResult, Option } from "@/infrastructure/result";
import type { JournalConfig } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { EnsureJournalEntryFlow, OpenJournalEntryFlow } from "@/journals/flows";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import type { Prompt, PromptAnswer } from "@/journals/prompts/config";
import { JournalsRepository } from "@/journals/repository";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import type { ShelfConfig } from "@/shelves/config";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { JournalsApiService } from "./journals-api";
import { apiModule } from "./module";

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

describe("JournalsApiService creation prompts", () => {
  const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

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
});
