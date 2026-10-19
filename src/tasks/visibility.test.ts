import { describe, expect, it } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "./module";
import { buildTaskItem } from "./testing";
import { TaskVisibility } from "./visibility";

import type { NoteVisibility } from "./providers/note-property/visibility";

const noFilter = { mode: "and" as const, conditions: [] };
const withRule = (name: string, rule: NoteVisibility) =>
  fixedJournal(name, { type: "day" }, { tasks: { providers: { "note-property": rule }, filter: noFilter } });
const matching = (tag: string): NoteVisibility => ({
  show: "matching",
  mode: "and",
  conditions: [{ type: "tag", tags: [tag] }],
});

const noteItem = (tags: string[]) =>
  buildTaskItem({
    provider: "note-property",
    key: "note-property:a.md",
    path: "a.md" as VaultPath,
    display: { kind: "note", path: "a.md" as VaultPath, title: "a" },
    facts: { frontmatterTags: tags },
  });

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: {
      journals: {
        Work: withRule("Work", matching("#work")),
        Personal: withRule("Personal", { show: "none", mode: "and", conditions: [] }),
        Plain: fixedJournal("Plain", { type: "day" }),
      },
    },
  });
  return harness.resolve(TaskVisibility);
}

describe("TaskVisibility", () => {
  it("always admits a checkbox item", async () => {
    const visibility = await build();

    expect(visibility.admits(buildTaskItem(), ["Personal"])).toBe(true);
  });

  it("admits a note item per the asking journal's rule", async () => {
    const visibility = await build();

    expect(visibility.admits(noteItem(["#work"]), ["Work"])).toBe(true);
    expect(visibility.admits(noteItem(["#home"]), ["Work"])).toBe(false);
    expect(visibility.admits(noteItem(["#work"]), ["Personal"])).toBe(false);
  });

  it("admits when any named journal admits", async () => {
    const visibility = await build();

    expect(visibility.admits(noteItem(["#work"]), ["Personal", "Work"])).toBe(true);
    expect(visibility.admits(noteItem(["#home"]), ["Personal", "Work"])).toBe(false);
  });

  it("treats a journal with no rule, an unknown journal, and no journal as All", async () => {
    const visibility = await build();

    expect(visibility.admits(noteItem(["#home"]), ["Plain"])).toBe(true);
    expect(visibility.admits(noteItem(["#home"]), ["Missing"])).toBe(true);
    expect(visibility.admits(noteItem(["#home"]), [])).toBe(true);
  });
});
