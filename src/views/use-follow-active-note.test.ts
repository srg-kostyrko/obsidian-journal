import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { testContainer, type TestHarness } from "@/testing";

import { useFollowActiveNote } from "./use-follow-active-note";

const MODULES = [journalsCoreModule, notesCalendarModule];

function renderEmptyDiv() {
  return h("div");
}

function openEntry(harness: TestHarness, journalName: string, anchor: AnchorString): void {
  const path = `${journalName}/${anchor}.md` as VaultPath;
  harness.resolve(JournalsIndex).register({ journalName, anchor, path });
  harness.host.emitFileOpen(harness.host.putFile(path));
}

async function mount(
  options: {
    enabled?: boolean;
    inScope?: (name: string) => boolean;
    initialActive?: { journalName: string; anchor: AnchorString };
    currentDate?: string;
  } = {},
) {
  // `initialActive` models a note already open when the view mounts: `ActiveEntryViewModel` is
  // eager, so with the default autoLoad it would already have read the (still empty) active file
  // before this function could open one. `autoLoad: false` defers its construction to the
  // composable's own `useService` call, which happens after the file is opened below.
  const harness = await testContainer({
    modules: MODULES,
    data: {
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
        quarterly: fixedJournal("quarterly", { type: "quarter" }),
        sprint: customJournal("sprint", "week", 2, "2026-01-05"),
      },
    },
    autoLoad: options.initialActive === undefined,
  });
  if (options.initialActive) {
    openEntry(harness, options.initialActive.journalName, options.initialActive.anchor);
  }

  const followed: AnchorString[] = [];
  const enabled = ref(options.enabled ?? true);
  const Host = defineComponent({
    setup() {
      useFollowActiveNote({
        enabled: () => enabled.value,
        inScope: options.inScope ?? (() => true),
        currentDate: () => (options.currentDate ?? "2026-08-15") as AnchorString,
        onFollow: (date) => followed.push(date),
      });
      return renderEmptyDiv;
    },
  });
  harness.render(Host);
  return { harness, followed, enabled };
}

describe("useFollowActiveNote", () => {
  it("writes the opened note's date", async () => {
    const { harness, followed } = await mount();

    openEntry(harness, "daily", "2026-03-09" as AnchorString);
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("writes the week's representative day for a weekly note", async () => {
    // ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, so the day
    // that carries the week-year is Thu 2026-01-01 — a different day and a different year.
    const { harness, followed } = await mount();

    openEntry(harness, "weekly", "2025-12-29" as AnchorString);
    await nextTick();

    expect(followed).toEqual(["2026-01-01"]);
  });

  it("ignores a note of a journal outside the view's scope", async () => {
    const { harness, followed } = await mount({ inScope: (name) => name === "daily" });

    openEntry(harness, "weekly", "2026-03-09" as AnchorString);
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("ignores the active note being cleared", async () => {
    const { harness, followed } = await mount();
    openEntry(harness, "daily", "2026-03-09" as AnchorString);
    await nextTick();

    harness.host.emitFileOpen(null);
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("stays silent while following is turned off", async () => {
    const { harness, followed } = await mount({ enabled: false });

    openEntry(harness, "daily", "2026-03-09" as AnchorString);
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("follows the open note as soon as following is turned on", async () => {
    const { followed, enabled } = await mount({
      enabled: false,
      initialActive: { journalName: "daily", anchor: "2026-03-09" as AnchorString },
    });

    enabled.value = true;
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("follows a note that is already active when the view mounts", async () => {
    const { followed } = await mount({ initialActive: { journalName: "daily", anchor: "2026-03-09" as AnchorString } });

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("holds the view's date when the opened note's period contains it", async () => {
    const { harness, followed } = await mount({ currentDate: "2026-08-15" });

    openEntry(harness, "quarterly", "2026-07-01" as AnchorString);
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("writes the opened note's date when its period does not contain the view's date", async () => {
    const { harness, followed } = await mount({ currentDate: "2026-06-15" });

    openEntry(harness, "quarterly", "2026-07-01" as AnchorString);
    await nextTick();

    expect(followed).toEqual(["2026-07-01"]);
  });

  it("writes a neighboring month's day note rather than holding on the current month", async () => {
    const { harness, followed } = await mount({ currentDate: "2026-04-15" });

    openEntry(harness, "daily", "2026-05-01" as AnchorString);
    await nextTick();

    expect(followed).toEqual(["2026-05-01"]);
  });

  it("writes the week's representative day even when the week contains the view's date", async () => {
    // ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, so 2025-12-31
    // sits inside the week but not on its representative day, Thu 2026-01-01.
    const { harness, followed } = await mount({ currentDate: "2025-12-31" });

    openEntry(harness, "weekly", "2025-12-29" as AnchorString);
    await nextTick();

    expect(followed).toEqual(["2026-01-01"]);
  });

  // An implementation that derives the interval from the view's date instead of the
  // entry's anchor makes coverage trivially true, so this alone cannot prove
  // correctness — see "follows the opened custom interval when it does not contain
  // the view's date" for the discriminating case.
  it("holds the view's date when the opened custom interval contains it", async () => {
    // The sprint anchored 2026-01-05 repeats every two weeks, so 2026-07-06 starts one that
    // runs through 2026-07-19.
    const { harness, followed } = await mount({ currentDate: "2026-07-10" });

    openEntry(harness, "sprint", "2026-07-06" as AnchorString);
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("follows the opened custom interval when it does not contain the view's date", async () => {
    // The sprint anchored 2026-01-05 repeats every two weeks, so 2026-07-06 starts one that
    // runs through 2026-07-19 — well before the view's date here.
    const { harness, followed } = await mount({ currentDate: "2026-08-15" });

    openEntry(harness, "sprint", "2026-07-06" as AnchorString);
    await nextTick();

    expect(followed).toEqual(["2026-07-06"]);
  });
});
