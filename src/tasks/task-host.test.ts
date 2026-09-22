import { describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "./module";
import { TaskIndex } from "./task-index";
import { TaskHostToken } from "./types";

const dayPath = "Daily/2026-09-22.md" as VaultPath;
const noteletPath = "Daily/2026-09-22 meeting.md" as VaultPath;
const rule = {
  compose: "replace",
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
};

const defaultTasks = { checkbox: rule };

async function build(tasks: unknown = defaultTasks) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks } as never) } },
  });
  const journals = harness.resolve(JournalsIndex);
  journals.register({ journalName: "Daily", anchor: anchor("2026-09-22"), path: dayPath });
  journals.register({
    kind: "notelet",
    journalName: "Daily",
    anchor: anchor("2026-09-22"),
    path: noteletPath,
    typeName: "Meeting",
    typeId: null,
  });
  return {
    harness,
    journals,
    repository: harness.resolve(JournalsRepository),
    host: harness.resolve(TaskHostToken),
    index: harness.resolve(TaskIndex),
  };
}

describe("TaskHostService", () => {
  it("lists every indexed note, notelets included, with its journal and that journal's whole tasks config", async () => {
    const { host } = await build();
    const owned = [...host.ownedNotes()];
    expect(owned.map((note) => note.path).toSorted()).toEqual([dayPath, noteletPath].toSorted());
    expect(owned.every((note) => note.journalName === "Daily")).toBe(true);
    // The host has no notion of "checkbox" — it hands over the journal's whole `tasks` config
    // verbatim, and the owning provider is the one that knows which key is its own.
    expect(owned.every((note) => note.rule && typeof note.rule === "object" && "checkbox" in note.rule)).toBe(true);
    const dayNote = owned.find((note) => note.path === dayPath);
    const noteletNote = owned.find((note) => note.path === noteletPath);
    expect(dayNote?.rule).toEqual({ checkbox: rule });
    expect(noteletNote?.rule).toEqual({ checkbox: rule });
  });

  it("passes a rule through untouched, even one it cannot interpret", async () => {
    const { host, repository } = await build();
    // Going through JournalsRepository.update rather than the seeded fixture: the seed is parsed
    // by journalConfigSchema, whose checkboxJournalRuleSchema fields all carry v.fallback
    // defaults, so a genuinely nonsense value never survives that parse to prove anything about
    // the host. update() writes straight into the live record with no re-validation, which is
    // the only way to hand the host something it truly cannot interpret.
    repository.update("Daily", { tasks: { checkbox: { nonsense: true } } } as never);
    const owned = host.ownerOf(dayPath);
    expect(owned.isSome() && owned.value.rule).toEqual({ checkbox: { nonsense: true } });
  });

  it("returns None for a path no journal owns", async () => {
    const { host } = await build();
    expect(host.ownerOf("project/ideas.md" as VaultPath).isNone()).toBe(true);
  });

  it("announces a note change when an index entry moves", async () => {
    const { host, journals } = await build();
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    journals.unregister(dayPath);
    expect(seen).toHaveBeenCalledWith({ kind: "note", path: dayPath });
  });

  it("announces a journal change when that journal's task rule is edited", async () => {
    const { host, repository } = await build();
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    repository.update("Daily", { tasks: { checkbox: { compose: "inherit", mode: "and", conditions: [] } } });
    expect(seen).toHaveBeenCalledWith({ kind: "journal", journalName: "Daily" });
  });

  it("does not announce a journal change for an update that leaves tasks untouched", async () => {
    const { host, repository } = await build();
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    repository.update("Daily", { notelets: {} });
    expect(seen).not.toHaveBeenCalled();
  });

  it("stops announcing after its disposer runs", async () => {
    const { host, journals } = await build();
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen)();
    journals.unregister(dayPath);
    expect(seen).not.toHaveBeenCalled();
  });

  it("forwards publish to the index", async () => {
    const { host, index } = await build();
    host.publish("checkbox", { path: dayPath }, []);
    expect(index.version()).toBeGreaterThan(0);
  });
});
