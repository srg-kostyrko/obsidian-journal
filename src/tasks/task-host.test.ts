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

const CHECKBOX = "checkbox";

const dayPath = "Daily/2026-09-22.md" as VaultPath;
const noteletPath = "Daily/2026-09-22 meeting.md" as VaultPath;
const otherPath = "Other/2026-09-22.md" as VaultPath;

const dailyRule = {
  compose: "replace",
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
};
const otherRule = {
  compose: "narrow",
  mode: "or",
  conditions: [{ type: "tag", condition: "has", tags: ["#task"] }],
};

const defaultDailyTasks = { checkbox: dailyRule };
const defaultOtherTasks = { checkbox: otherRule };

// Two journals, each owning at least one note under its own distinct rule: a fixture with a
// single journal cannot falsify "the wrong journal's rule leaked onto this note."
async function build(dailyTasks: unknown = defaultDailyTasks, otherTasks: unknown = defaultOtherTasks) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: {
      journals: {
        Daily: fixedJournal("Daily", { type: "day" }, { tasks: dailyTasks } as never),
        Other: fixedJournal("Other", { type: "day" }, { tasks: otherTasks } as never),
      },
    },
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
  journals.register({ journalName: "Other", anchor: anchor("2026-09-22"), path: otherPath });
  return {
    harness,
    journals,
    repository: harness.resolve(JournalsRepository),
    host: harness.resolve(TaskHostToken),
    index: harness.resolve(TaskIndex),
  };
}

describe("TaskHostService", () => {
  it("lists every indexed note across journals, notelets included, each with its own journal's rule", async () => {
    const { host } = await build();
    const owned = [...host.ownedNotes(CHECKBOX)];
    expect(owned.map((note) => note.path).toSorted()).toEqual([dayPath, noteletPath, otherPath].toSorted());

    const dayNote = owned.find((note) => note.path === dayPath);
    const noteletNote = owned.find((note) => note.path === noteletPath);
    const otherNote = owned.find((note) => note.path === otherPath);
    expect(dayNote?.journalName).toBe("Daily");
    expect(noteletNote?.journalName).toBe("Daily");
    expect(otherNote?.journalName).toBe("Other");
    expect(dayNote?.rule).toEqual(dailyRule);
    expect(noteletNote?.rule).toEqual(dailyRule);
    expect(otherNote?.rule).toEqual(otherRule);
  });

  it("narrows the walk to one journal when asked for one", async () => {
    const { host } = await build();
    const owned = [...host.ownedNotes(CHECKBOX, "Daily")];
    expect(owned.map((note) => note.path).toSorted()).toEqual([dayPath, noteletPath].toSorted());
    expect(owned.every((note) => note.rule === owned.at(0)?.rule)).toBe(true);
  });

  it("yields nothing for a journal name no config holds", async () => {
    const { host } = await build();
    expect([...host.ownedNotes(CHECKBOX, "Nonexistent")]).toEqual([]);
  });

  it("reads the rule keyed by the given provider id, not a fixed key", async () => {
    const { host, repository } = await build();
    // Bypassing the seeded fixture, whose schema only knows the "checkbox" field: update() writes
    // straight into the live record with no re-validation, so a second provider's key survives
    // to prove the host looks it up by the id it was given rather than a name it hardcodes.
    repository.update("Daily", { tasks: { checkbox: dailyRule, otherProvider: { marker: true } } } as never);

    const checkboxOwned = host.ownerOf(dayPath, CHECKBOX);
    const otherOwned = host.ownerOf(dayPath, "otherProvider");
    expect(checkboxOwned.isSome() && checkboxOwned.value.rule).toEqual(dailyRule);
    expect(otherOwned.isSome() && otherOwned.value.rule).toEqual({ marker: true });

    const fromOwnedNotes = [...host.ownedNotes("otherProvider")].find((note) => note.path === dayPath);
    expect(fromOwnedNotes?.rule).toEqual({ marker: true });
  });

  it("passes a rule through untouched, even one it cannot interpret", async () => {
    const { host, repository } = await build();
    repository.update("Daily", { tasks: { checkbox: { nonsense: true } } } as never);
    const owned = host.ownerOf(dayPath, CHECKBOX);
    expect(owned.isSome() && owned.value.rule).toEqual({ nonsense: true });
  });

  it("returns None for a path no journal owns", async () => {
    const { host } = await build();
    expect(host.ownerOf("project/ideas.md" as VaultPath, CHECKBOX).isNone()).toBe(true);
  });

  it("announces a note change when an index entry moves", async () => {
    const { host, journals } = await build();
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    journals.unregister(dayPath);
    expect(seen).toHaveBeenCalledWith({ kind: "note", path: dayPath });
  });

  it("announces a journal change naming only the journal whose rule was edited", async () => {
    const { host, repository } = await build();
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    repository.update("Daily", { tasks: { checkbox: { compose: "inherit", mode: "and", conditions: [] } } });
    expect(seen).toHaveBeenCalledWith({ kind: "journal", journalName: "Daily" });
    expect(seen).not.toHaveBeenCalledWith({ kind: "journal", journalName: "Other" });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  // A checkbox tick changes neither the slot nor the frontmatter payload JournalsIndex compares,
  // so `register` early-returns and no entryChanged fires. Without a metadata subscription of its
  // own the index keeps pre-edit items until some unrelated event happens to refill the path.
  it("announces a note change when an owned note's parse changes", async () => {
    const { host, harness } = await build();
    harness.host.putFile(dayPath);
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    harness.host.emitMetadata(dayPath);
    expect(seen).toHaveBeenCalledWith({ kind: "note", path: dayPath });
  });

  it("stays quiet when a note no journal owns changes", async () => {
    const { host, harness } = await build();
    const unowned = "project/ideas.md" as VaultPath;
    harness.host.putFile(unowned);
    const seen = vi.fn();
    host.onOwnedNotesChanged(seen);
    harness.host.emitMetadata(unowned);
    expect(seen).not.toHaveBeenCalled();
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
    host.publish(CHECKBOX, { path: dayPath }, []);
    expect(index.version()).toBeGreaterThan(0);
  });
});
