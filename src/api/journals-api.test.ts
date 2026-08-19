import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SuggestService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { NoteFileService } from "@/infrastructure/host/internal/note-file-service";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult, Err, Ok } from "@/infrastructure/result";
import type { JournalConfig } from "@/journals/config";
import { CycleService } from "@/journals/cycle";
import { JournalDateResolver } from "@/journals/flows";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { NoteCreationService } from "@/journals/notes/note-creation";
import { NotePathService } from "@/journals/notes/note-path";
import { NumberingService } from "@/journals/numbering";
import { JournalsRepository } from "@/journals/repository";
import type { JournalsEvents } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { TimelineService } from "@/journals/timeline";
import { JournalsEventsToken } from "@/journals/tokens";
import { ShelvesService } from "@/shelves/service";
import { TemplateEngine } from "@/templates";

import { JournalsApiService } from "./journals-api";

interface BuildOptions {
  /** Which shelf each journal sits on. Default: none. */
  shelfOf?: (name: string) => string;
  /** What the picker returns when several journals match. null = dismissed. */
  pick?: string | null;
  /** Leave the index un-ready so whenReady() stays pending. Default true. */
  ready?: boolean;
}

interface FlowCall {
  flow: string;
  parameters: Record<string, unknown>;
}

function buildApi(journals: Record<string, JournalConfig>, options: BuildOptions = {}) {
  const pickedNames: string[][] = [];
  const flowCalls: FlowCall[] = [];

  const c = new Container();
  c.addModule(LoggerModule);
  // fakeRepo would build its own emitter; the API subscribes through the DI token, so both
  // sides have to share one.
  const journalEvents = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(journals, journalEvents);
  c.register(JournalsRepository).useValue(repo);
  c.register(JournalsEventsToken).useValue(journalEvents);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  c.register(ShelvesService).useValue({ shelfOf: options.shelfOf ?? (() => "") } as never);
  c.register(NoteFileService).useValue({ resolve: (path: string) => ({ path }) } as never);
  c.register(WorkspaceService).useValue({} as never);
  c.register(SuggestService).useValue({
    open: (_definition: unknown, names: string[]) => {
      pickedNames.push([...names]);
      return Promise.resolve(options.pick == null ? new Err(new Error("dismissed")) : new Ok(options.pick));
    },
  } as never);
  c.register(JournalDateResolver).useClass(JournalDateResolver);
  c.register(NoteCreationService).useValue({} as never);

  const index = c.resolve(JournalsIndex);
  if (options.ready !== false) index.markReady();

  // Stands in for Flows. It deliberately does NOT register the new entry: a real write
  // returns as soon as the note is on disk, and JournalsIndex only learns about it once
  // Obsidian re-parses the frontmatter. Idempotent for an entry that already exists,
  // matching NoteCreationService.ensureNote.
  c.register(Flows).useValue({
    invoke: (cls: { name: string }, parameters: Record<string, unknown>) => {
      flowCalls.push({ flow: cls.name, parameters });
      const name = String(parameters.journalName);
      const anchor = String(parameters.anchor) as AnchorString;
      const existing = index.entryByAnchor(name, anchor);
      if (existing.isSome()) return AsyncResult.ok({ path: existing.value.path, created: false });
      return AsyncResult.ok({ path: `${name}/${anchor}.md` as VaultPath, created: true });
    },
  } as never);
  c.register(JournalsApiService).useClass(JournalsApiService);

  return { api: c.resolve(JournalsApiService), index, repo, pickedNames, flowCalls };
}

const ISO_WEEK = { dow: 1, doy: 4 };

describe("JournalsApiService reads", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar(ISO_WEEK));
  });

  afterEach(() => {
    teardown();
  });

  it("lists every journal when the selector is omitted", async () => {
    const { api } = buildApi({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    });

    const listed = await api.listJournals();

    expect(listed.map((info) => info.name).toSorted()).toEqual(["daily", "weekly"]);
  });

  it("does not wait for the index to be ready", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) }, { ready: false });

    const listed = await api.listJournals();

    expect(listed.map((info) => info.name)).toEqual(["daily"]);
  });

  it("ANDs the selector fields", async () => {
    const { api } = buildApi(
      {
        workDaily: fixedJournal("workDaily", { type: "day" }),
        homeDaily: fixedJournal("homeDaily", { type: "day" }),
        workWeekly: fixedJournal("workWeekly", { type: "week" }),
      },
      { shelfOf: (name) => (name.startsWith("work") ? "Work" : "") },
    );

    const listed = await api.listJournals({ writeType: "day", shelf: "Work" });

    expect(listed.map((info) => info.name)).toEqual(["workDaily"]);
  });

  it("selects off-shelf journals with a null shelf", async () => {
    const { api } = buildApi(
      { onShelf: fixedJournal("onShelf", { type: "day" }), loose: fixedJournal("loose", { type: "day" }) },
      { shelfOf: (name) => (name === "onShelf" ? "Work" : "") },
    );

    const listed = await api.listJournals({ shelf: null });

    expect(listed.map((info) => info.name)).toEqual(["loose"]);
  });

  it("returns null from journalInfo for an unknown journal", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    expect(await api.journalInfo("nope")).toBeNull();
  });

  it("reports a period with no note as file null and a predicted path", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const [note] = await api.notesFor("daily", "2026-08-18");

    expect(note?.date).toBe("2026-08-18");
    expect(note?.displayDate).toBe("2026-08-18");
    expect(note?.endDate).toBe("2026-08-18");
    expect(note?.path).toBe("2026-08-18.md");
    expect(note?.file).toBeNull();
  });

  it("gives a weekly note its first day as date and its representative as displayDate", async () => {
    const { api } = buildApi({ weekly: fixedJournal("weekly", { type: "week" }) });

    const [note] = await api.notesFor("weekly", "2026-01-01");

    expect(note?.date).toBe("2025-12-29");
    expect(note?.displayDate).toBe("2026-01-01");
    expect(note?.endDate).toBe("2026-01-04");
  });

  it("reports the note's real path when one exists, not the rendered one", async () => {
    const { api, index } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });
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
    const { api } = buildApi({
      a: fixedJournal("a", { type: "day" }),
      b: fixedJournal("b", { type: "day" }),
    });

    const notes = await api.notesFor({ writeType: "day" }, "2026-08-18");

    expect(notes.map((note) => note.journal).toSorted()).toEqual(["a", "b"]);
  });

  it("gives a null path for a date outside the timeline with no note", async () => {
    const { api } = buildApi({
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
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.notesFor("daily", "whenever")).rejects.toMatchObject({ code: "invalid-date" });
  });

  it("resolves journalOf from the file it was handed", async () => {
    const { api, index } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });
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
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    expect(await api.journalOf({ path: "Random/note.md" })).toBeNull();
  });
});

describe("JournalsApiService writes", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar(ISO_WEEK));
  });

  afterEach(() => {
    teardown();
  });

  it("creates the note through the ensure flow and reports created", async () => {
    const { api, flowCalls } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18");

    expect(result.created).toBe(true);
    expect(result.note.journal).toBe("daily");
    expect(result.note.file).not.toBeNull();
    expect(flowCalls.at(-1)?.flow).toBe("EnsureJournalEntryFlow");
  });

  it("returns the created note before the index has caught up", async () => {
    const { api, index } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const result = await api.ensureNote("daily", "2026-08-18");

    // The index is still empty — the result must come from the write, not a lookup.
    expect(index.entryByAnchor("daily", "2026-08-18" as AnchorString).isNone()).toBe(true);
    expect(result.note.path).toBe("daily/2026-08-18.md");
    expect(result.note.file).not.toBeNull();
    expect(result.note.endDate).toBe("2026-08-18");
  });

  it("opens through the open flow, passing the open mode", async () => {
    const { api, flowCalls } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api.openNote("daily", "2026-08-18", { openMode: "split" });

    expect(flowCalls.at(-1)?.flow).toBe("OpenJournalEntryFlow");
    expect(flowCalls.at(-1)?.parameters).toMatchObject({ openMode: "split" });
  });

  it("rejects with no-matching-journal when the selector matches nothing", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.ensureNote({ writeType: "quarter" }, "2026-08-18")).rejects.toMatchObject({
      code: "no-matching-journal",
    });
  });

  it("rejects with journal-not-found for an unknown name", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await expect(api.ensureNote("nope", "2026-08-18")).rejects.toMatchObject({ code: "journal-not-found" });
  });

  it("rejects with outside-timeline when no note exists and the date is out of range", async () => {
    const { api } = buildApi({
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

  it("still reaches a note that exists outside the timeline", async () => {
    const { api, index } = buildApi({
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
    index.register({
      journalName: "past",
      anchor: "2026-08-18" as AnchorString,
      path: "Past/2026-08-18.md" as VaultPath,
    });

    const result = await api.ensureNote("past", "2026-08-18");

    expect(result.note.path).toBe("Past/2026-08-18.md");
    expect(result.created).toBe(false);
  });

  it("shows the picker when several journals match, and uses the choice", async () => {
    const { api, pickedNames } = buildApi(
      { a: fixedJournal("a", { type: "day" }), b: fixedJournal("b", { type: "day" }) },
      { pick: "b" },
    );

    const result = await api.ensureNote({ writeType: "day" }, "2026-08-18");

    expect(pickedNames).toEqual([["a", "b"]]);
    expect(result.note.journal).toBe("b");
  });

  it("rejects with aborted when the user dismisses the picker", async () => {
    const { api } = buildApi(
      { a: fixedJournal("a", { type: "day" }), b: fixedJournal("b", { type: "day" }) },
      { pick: null },
    );

    await expect(api.ensureNote({ writeType: "day" }, "2026-08-18")).rejects.toMatchObject({ code: "aborted" });
  });

  it("passes skipConfirmation only when confirm is given", async () => {
    const { api, flowCalls } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api.ensureNote("daily", "2026-08-18", { confirm: false });
    expect(flowCalls.at(-1)?.parameters).toMatchObject({ skipConfirmation: true });

    await api.ensureNote("daily", "2026-08-19");
    expect(flowCalls.at(-1)?.parameters.skipConfirmation).toBeUndefined();
  });

  it("shares one flow invocation between concurrent calls for the same period", async () => {
    const { api, flowCalls } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    const [first, second] = await Promise.all([
      api.ensureNote("daily", "2026-08-18"),
      api.ensureNote("daily", "2026-08-18"),
    ]);

    expect(flowCalls).toHaveLength(1);
    expect(first.note.path).toBe(second.note.path);
  });

  it("does not share invocations across different periods", async () => {
    const { api, flowCalls } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await Promise.all([api.ensureNote("daily", "2026-08-18"), api.ensureNote("daily", "2026-08-19")]);

    expect(flowCalls).toHaveLength(2);
  });
});

describe("JournalsApiService events", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar(ISO_WEEK));
  });

  afterEach(() => {
    teardown();
  });

  it("reports a rename with both names", () => {
    const { api, repo } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });
    const seen: { from: string; to: string }[] = [];
    api.on("journalRenamed", (event) => {
      seen.push(event);
    });

    repo.rename("daily", "journal");

    expect(seen).toEqual([{ from: "daily", to: "journal" }]);
  });

  it("reports an added note by date", () => {
    const { api, index } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });
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

  it("reports a removed note", () => {
    const { api, index } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });
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

  it("stops delivering after the disposer runs", () => {
    const { api, index } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });
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
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar(ISO_WEEK));
  });

  afterEach(() => {
    teardown();
  });

  it("rejects an in-flight call with plugin-unloaded", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) }, { ready: false });
    const pending = api.notesFor("daily", "2026-08-18");

    await api[Symbol.asyncDispose]();

    await expect(pending).rejects.toMatchObject({ code: "plugin-unloaded" });
  });

  it("rejects calls made after disposal", async () => {
    const { api } = buildApi({ daily: fixedJournal("daily", { type: "day" }) });

    await api[Symbol.asyncDispose]();

    await expect(api.notesFor("daily", "2026-08-18")).rejects.toMatchObject({ code: "plugin-unloaded" });
  });
});
