import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";

import { MoveTargets } from "./containing";

async function targetsFor(journals: readonly JournalConfig[], shelves: readonly ShelfConfig[] = []) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule],
    data: {
      journals: Object.fromEntries(journals.map((journal) => [journal.name, journal])),
      shelves: Object.fromEntries(shelves.map((shelf) => [shelf.name, shelf])),
    },
  });
  const index = harness.resolve(JournalsIndex);
  const put = (journalName: string, at: string): VaultPath => {
    const path = `${journalName}/${at}.md` as VaultPath;
    index.register({ journalName, anchor: anchor(at), path });
    return path;
  };
  const putNotelet = (journalName: string, at: string, name: string): VaultPath => {
    const path = `${journalName}/notelets/${name}.md` as VaultPath;
    index.register({ kind: "notelet", journalName, anchor: anchor(at), path, typeName: "Meeting", typeId: null });
    return path;
  };
  const targets = harness.resolve(MoveTargets);
  return { put, putNotelet, containing: (path: VaultPath) => targets.containingTargets(path) };
}

const daily = fixedJournal("daily", { type: "day" });
const monthly = fixedJournal("monthly", { type: "month" });
const work = fixedJournal("work", { type: "month" });
const weekly = fixedJournal("weekly", { type: "week" });
const yearly = fixedJournal("yearly", { type: "year" });

describe("MoveTargets.containingTargets", () => {
  it("a day note on a shelf with a month journal targets that month", async () => {
    const { put, containing } = await targetsFor(
      [daily, monthly, work],
      [buildShelf("home", { journals: ["daily", "monthly"] }), buildShelf("job", { journals: ["work"] })],
    );
    const source = put("daily", "2026-10-21");
    const october = put("monthly", "2026-10-01");

    expect(containing(source)).toEqual([
      { journalName: "monthly", anchor: anchor("2026-10-01"), path: october, label: "October 2026" },
    ]);
  });

  it("two month journals both appear, labelled by journal", async () => {
    const { put, containing } = await targetsFor(
      [daily, work, monthly, yearly],
      [buildShelf("home", { journals: ["daily", "work", "monthly"] }), buildShelf("other", { journals: ["yearly"] })],
    );
    const source = put("daily", "2026-10-21");

    expect(containing(source)).toEqual([
      { journalName: "monthly", anchor: anchor("2026-10-01"), path: null, label: "October 2026" },
      { journalName: "work", anchor: anchor("2026-10-01"), path: null, label: "October 2026" },
    ]);
  });

  it("a journal on no shelf considers every journal", async () => {
    const { put, containing } = await targetsFor(
      [daily, weekly, yearly, monthly],
      [buildShelf("home", { journals: ["monthly"] })],
    );
    const source = put("daily", "2026-10-21");

    expect(containing(source).map((target) => [target.journalName, target.anchor])).toEqual([
      ["weekly", anchor("2026-10-19")],
      ["monthly", anchor("2026-10-01")],
      ["yearly", anchor("2026-01-01")],
    ]);
  });

  it("finer and equal journals are excluded", async () => {
    const otherWeekly = fixedJournal("other-weekly", { type: "week" });
    const { put, containing } = await targetsFor(
      [daily, weekly, otherWeekly, monthly],
      [buildShelf("home", { journals: ["daily", "weekly", "other-weekly", "monthly"] })],
    );
    const source = put("weekly", "2026-10-19");

    expect(containing(source).map((target) => target.journalName)).toEqual(["monthly"]);
  });

  it("existing notelets follow their period note", async () => {
    const { put, putNotelet, containing } = await targetsFor(
      [daily, monthly, yearly],
      [buildShelf("home", { journals: ["daily", "monthly", "yearly"] })],
    );
    const source = put("daily", "2026-10-21");
    const october = put("monthly", "2026-10-01");
    const zebra = putNotelet("monthly", "2026-10-01", "Zebra review");
    const alpha = putNotelet("monthly", "2026-10-01", "Alpha sync");
    putNotelet("monthly", "2026-09-01", "September retro");
    putNotelet("daily", "2026-10-21", "Standup");

    expect(containing(source)).toEqual([
      { journalName: "monthly", anchor: anchor("2026-10-01"), path: october, label: "October 2026" },
      {
        journalName: "monthly",
        anchor: anchor("2026-10-01"),
        path: alpha,
        label: "October 2026",
        noteletTitle: "Alpha sync",
      },
      {
        journalName: "monthly",
        anchor: anchor("2026-10-01"),
        path: zebra,
        label: "October 2026",
        noteletTitle: "Zebra review",
      },
      { journalName: "yearly", anchor: anchor("2026-01-01"), path: null, label: "2026" },
    ]);
  });

  it("a period outside the target timeline is excluded", async () => {
    const lateMonthly = fixedJournal(
      "late",
      { type: "month" },
      { timeline: { start: anchor("2026-11-01"), end: { kind: "never" } } },
    );
    const { put, containing } = await targetsFor(
      [daily, lateMonthly, monthly],
      [buildShelf("home", { journals: ["daily", "late", "monthly"] })],
    );
    const source = put("daily", "2026-10-21");

    expect(containing(source).map((target) => target.journalName)).toEqual(["monthly"]);
  });

  it("a custom-interval source yields nothing", async () => {
    const sprints = customJournal("sprints", "week", 2, "2026-10-05");
    const customTarget = customJournal("cycles", "month", 3, "2026-10-01");
    const { put, containing } = await targetsFor(
      [daily, sprints, customTarget, monthly],
      [buildShelf("home", { journals: ["daily", "sprints", "cycles", "monthly"] })],
    );

    expect(containing(put("sprints", "2026-10-19"))).toEqual([]);
    expect(containing(put("daily", "2026-10-21")).map((target) => target.journalName)).toEqual(["monthly"]);
    expect(containing("not-a-journal/note.md" as VaultPath)).toEqual([]);
  });
});
