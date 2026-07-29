import { render } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { fixedJournal } from "@/journals/testing";
import { buildNotesCalendarHarness } from "@/notes-calendar/testing";

import { useFollowActiveNote } from "./use-follow-active-note";

function renderEmptyDiv() {
  return h("div");
}

function mount(options: { enabled?: boolean; inScope?: (name: string) => boolean } = {}) {
  const harness = buildNotesCalendarHarness({
    journals: {
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    },
  });
  const followed: AnchorString[] = [];
  const Host = defineComponent({
    setup() {
      useFollowActiveNote({
        enabled: () => options.enabled ?? true,
        inScope: options.inScope ?? (() => true),
        onFollow: (date) => followed.push(date),
      });
      return renderEmptyDiv;
    },
  });
  render(Host, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, harness.container) }] },
  });
  return { followed, active: harness.active };
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

  it("follows a note that is already active when the view mounts", () => {
    const harness = buildNotesCalendarHarness({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.active.setActive({ journalName: "daily", anchor: "2026-03-09" as AnchorString });
    const followed: AnchorString[] = [];
    const Host = defineComponent({
      setup() {
        useFollowActiveNote({ enabled: () => true, inScope: () => true, onFollow: (date) => followed.push(date) });
        return renderEmptyDiv;
      },
    });
    render(Host, {
      global: { plugins: [{ install: (app) => provideInjectorOnApp(app, harness.container) }] },
    });

    expect(followed).toEqual(["2026-03-09"]);
  });
});
