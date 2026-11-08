import { moment } from "obsidian";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CalendarDate, MonthPeriod } from "@/calendar";
import { calendarDisplayCoreModule } from "@/calendar/settings/module";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { initLocale } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer } from "@/testing";

import { notesCalendarModule } from "../module";

import NotesMonthView from "./NotesMonthView.vue";

const MODULES = [
  calendarDisplayCoreModule,
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
  tasksCoreModule,
];

// Built per test: the anchor is parsed under whichever locale the test installed.
const august = (): MonthPeriod => MonthPeriod.containing(CalendarDate.fromAnchor(anchor("2026-08-15")));
const daily = { daily: fixedJournal("daily", { type: "day" }) };

// Arabic formats every digit natively, so a weekday read back off `format("d")` is NaN.
describe("NotesMonthView under a native-digit locale", () => {
  let prior: string;

  beforeAll(async () => {
    // @ts-expect-error -- moment ships no type declarations for its locale subpath modules.
    await import("moment/locale/ar");
    initLocale("en");
    prior = moment.locale();
    moment.locale("ar");
    installTestCalendar();
  });

  afterAll(() => {
    moment.locale(prior);
  });

  it("marks the locale's Friday and Saturday weekend", async () => {
    const harness = await testContainer({ modules: MODULES, data: { journals: daily } });
    const { container } = harness.render(NotesMonthView, { props: { shelf: null, month: august(), weeks: "left" } });

    const band = container.querySelector<HTMLElement>('.notes-calendar-band[data-band="weekend"]');
    expect(band?.style.gridColumn).toBe("7 / span 2");
    // Six Monday-start rows, two weekend days each.
    expect(container.querySelectorAll(".notes-month-view__day[data-weekend]").length).toBe(12);
  });

  it("hides the hidden weekdays", async () => {
    const harness = await testContainer({ modules: MODULES, data: { journals: daily } });
    const { container } = harness.render(NotesMonthView, {
      props: { shelf: null, month: august(), hiddenWeekdays: [5, 6] },
    });

    expect(container.querySelectorAll(".notes-month-view__day").length).toBe(30);
    expect(container.querySelector("[data-weekend]")).toBeNull();
  });
});
