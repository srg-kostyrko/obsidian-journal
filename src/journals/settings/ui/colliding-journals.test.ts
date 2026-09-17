import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { CycleService } from "../../cycle";
import { FrontmatterService } from "../../frontmatter";
import { NotePathService } from "../../notes/note-path";
import { JournalsRepository } from "../../repository";
import { TimelineService } from "../../timeline";

import { findCollidingJournals } from "./colliding-journals";

import type { JournalConfig } from "../../config";

async function collisions(journals: Record<string, JournalConfig>): Promise<string[][]> {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals } });
  const groups = findCollidingJournals([...harness.resolve(JournalsRepository).find().list()], {
    cycle: harness.resolve(CycleService),
    frontmatter: harness.resolve(FrontmatterService),
    paths: harness.resolve(NotePathService),
    timeline: harness.resolve(TimelineService),
  });
  return groups.map((group) => group.map((journal) => journal.name));
}

describe("findCollidingJournals", () => {
  it("groups journals that resolve to the same path", async () => {
    const groups = await collisions({
      daily: fixedJournal("daily", { type: "day" }),
      diary: fixedJournal("diary", { type: "day" }),
    });

    expect(groups).toEqual([["daily", "diary"]]);
  });

  it("does not flag journals that differ by folder", async () => {
    const groups = await collisions({
      a: fixedJournal("a", { type: "day" }, { folder: "x" }),
      b: fixedJournal("b", { type: "day" }, { folder: "y" }),
    });

    expect(groups).toEqual([]);
  });

  it("does not flag journals whose only difference is the journal-name variable", async () => {
    const groups = await collisions({
      a: fixedJournal("a", { type: "day" }, { nameTemplate: "{{journal_name}} {{date}}" }),
      b: fixedJournal("b", { type: "day" }, { nameTemplate: "{{journal_name}} {{date}}" }),
    });

    expect(groups).toEqual([]);
  });

  it("flags journals whose default date formats differ but whose template sets its own", async () => {
    const groups = await collisions({
      a: fixedJournal("a", { type: "day" }, { nameTemplate: "{{date:YYYY-MM-DD}}", dateFormat: "YYYY-MM-DD" }),
      b: fixedJournal("b", { type: "day" }, { nameTemplate: "{{date:YYYY-MM-DD}}", dateFormat: "DD.MM.YYYY" }),
    });

    expect(groups).toEqual([["a", "b"]]);
  });

  it("does not flag journals whose default date formats render different paths", async () => {
    const groups = await collisions({
      a: fixedJournal("a", { type: "day" }, { nameTemplate: "{{date}}", dateFormat: "YYYY-MM-DD" }),
      b: fixedJournal("b", { type: "day" }, { nameTemplate: "{{date}}", dateFormat: "DD.MM.YYYY" }),
    });

    expect(groups).toEqual([]);
  });

  it("flags a day and a week journal whose templates render the same path for the week's first day", async () => {
    const groups = await collisions({
      daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date:YYYY-MM-DD}}" }),
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{start_date:YYYY-MM-DD}}" }),
    });

    expect(groups).toEqual([["daily", "weekly"]]);
  });

  it("does not flag journals whose timelines never overlap", async () => {
    const groups = await collisions({
      before: fixedJournal(
        "before",
        { type: "day" },
        { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2000-01-01" as AnchorString } } },
      ),
      after: fixedJournal(
        "after",
        { type: "day" },
        { timeline: { start: "2020-01-01" as AnchorString, end: { kind: "never" } } },
      ),
    });

    expect(groups).toEqual([]);
  });

  it("flags a journal that ended long ago against one that still covers its dates", async () => {
    const groups = await collisions({
      before: fixedJournal(
        "before",
        { type: "day" },
        { timeline: { start: "" as AnchorString, end: { kind: "date", date: "2000-01-01" as AnchorString } } },
      ),
      always: fixedJournal("always", { type: "day" }),
    });

    expect(groups).toEqual([["before", "always"]]);
  });

  it("flags a year journal that shares only its first day with a day journal", async () => {
    const groups = await collisions({
      daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date:YYYY-MM-DD}}" }),
      yearly: fixedJournal("yearly", { type: "year" }, { nameTemplate: "{{start_date:YYYY-MM-DD}}" }),
    });

    expect(groups).toEqual([["daily", "yearly"]]);
  });

  it("joins journals linked through a shared third journal into one group", async () => {
    const groups = await collisions({
      a: fixedJournal("a", { type: "day" }, { nameTemplate: "{{date:YYYY-MM-DD}}", dateFormat: "YYYY" }),
      b: fixedJournal("b", { type: "day" }, { nameTemplate: "{{date:YYYY-MM-DD}}" }),
      c: fixedJournal("c", { type: "week" }, { nameTemplate: "{{start_date:YYYY-MM-DD}}" }),
    });

    expect(groups).toEqual([["a", "b", "c"]]);
  });
});
