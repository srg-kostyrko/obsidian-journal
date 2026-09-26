import { describe, expect, it } from "vitest";

import { journalDefaultsFor, type JournalConfig } from "@/journals";
import { shelvesCollection, type ShelfConfig } from "@/shelves";

import { taskRollupScope } from "./rollup-scope";

function journal(name: string): JournalConfig {
  return journalDefaultsFor({ type: "day" }, name);
}

function shelf(name: string, journals: readonly string[]): ShelfConfig {
  return { ...shelvesCollection.defaultItem(name), journals: [...journals] };
}

describe("taskRollupScope", () => {
  it("returns the owning shelf's journals, host included, when the host is on a shelf", () => {
    const daily = journal("Daily");
    const monthly = journal("Monthly");
    const stray = journal("Stray");
    const shelves = [shelf("work", ["Daily", "Monthly"])];

    expect(taskRollupScope("Monthly", [daily, monthly, stray], shelves)).toEqual(["Daily", "Monthly"]);
  });

  it("returns every journal when the host is on no shelf", () => {
    const daily = journal("Daily");
    const monthly = journal("Monthly");
    const shelves = [shelf("work", ["Daily"])];

    expect(taskRollupScope("Monthly", [daily, monthly], shelves)).toEqual(["Daily", "Monthly"]);
  });

  it("returns every journal when there are no shelves at all", () => {
    const daily = journal("Daily");
    const monthly = journal("Monthly");

    expect(taskRollupScope("Monthly", [daily, monthly], [])).toEqual(["Daily", "Monthly"]);
  });
});
