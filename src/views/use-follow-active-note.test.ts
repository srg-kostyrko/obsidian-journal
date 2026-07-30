import { render } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { customJournal, fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness } from "@/notes-calendar/testing";

import { useFollowActiveNote } from "./use-follow-active-note";

function renderEmptyDiv() {
  return h("div");
}

function mount(
  options: {
    enabled?: boolean;
    inScope?: (name: string) => boolean;
    initialActive?: { journalName: string; anchor: AnchorString };
    currentDate?: string;
  } = {},
) {
  const harness = buildNotesCalendarHarness({
    journals: {
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
      quarterly: fixedJournal("quarterly", { type: "quarter" }),
      sprint: customJournal("sprint", "week", 2, "2026-01-05"),
    },
  });
  if (options.initialActive) harness.active.setActive(options.initialActive);
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
  render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, harness.container) }] },
  });
  return { followed, active: harness.active, enabled };
}

beforeAll(() => {
  installTestCalendar();
});

describe("useFollowActiveNote", () => {
  it("writes the opened note's date", async () => {
    const { followed, active } = mount();

    active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("writes the week's representative day for a weekly note", async () => {
    // ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, so the day
    // that carries the week-year is Thu 2026-01-01 — a different day and a different year.
    const { followed, active } = mount();

    active.setActive({ journalName: "weekly", anchor: "2025-12-29" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-01-01"]);
  });

  it("ignores a note of a journal outside the view's scope", async () => {
    const { followed, active } = mount({ inScope: (name) => name === "daily" });

    active.setActive({ journalName: "weekly", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("ignores the active note being cleared", async () => {
    const { followed, active } = mount();
    active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    active.setActive(null);
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("stays silent while following is turned off", async () => {
    const { followed, active } = mount({ enabled: false });

    active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("follows the open note as soon as following is turned on", async () => {
    const { followed, enabled } = mount({
      enabled: false,
      initialActive: { journalName: "daily", anchor: "2026-03-09" as AnchorString },
    });

    enabled.value = true;
    await nextTick();

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("follows a note that is already active when the view mounts", () => {
    const { followed } = mount({ initialActive: { journalName: "daily", anchor: "2026-03-09" as AnchorString } });

    expect(followed).toEqual(["2026-03-09"]);
  });

  it("holds the view's date when the opened note's period contains it", async () => {
    const { followed, active } = mount({ currentDate: "2026-08-15" });

    active.setActive({ journalName: "quarterly", anchor: "2026-07-01" as AnchorString });
    await nextTick();

    expect(followed).toEqual([]);
  });

  it("writes the opened note's date when its period does not contain the view's date", async () => {
    const { followed, active } = mount({ currentDate: "2026-06-15" });

    active.setActive({ journalName: "quarterly", anchor: "2026-07-01" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-07-01"]);
  });

  it("writes a neighboring month's day note rather than holding on the current month", async () => {
    const { followed, active } = mount({ currentDate: "2026-04-15" });

    active.setActive({ journalName: "daily", anchor: "2026-05-01" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-05-01"]);
  });

  it("writes the week's representative day even when the week contains the view's date", async () => {
    // ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, so 2025-12-31
    // sits inside the week but not on its representative day, Thu 2026-01-01.
    const { followed, active } = mount({ currentDate: "2025-12-31" });

    active.setActive({ journalName: "weekly", anchor: "2025-12-29" as AnchorString });
    await nextTick();

    expect(followed).toEqual(["2026-01-01"]);
  });

  it("holds the view's date when the opened custom interval contains it", async () => {
    // The sprint anchored 2026-01-05 repeats every two weeks, so 2026-07-06 starts one that
    // runs through 2026-07-19.
    const { followed, active } = mount({ currentDate: "2026-07-10" });

    active.setActive({ journalName: "sprint", anchor: "2026-07-06" as AnchorString });
    await nextTick();

    expect(followed).toEqual([]);
  });
});
