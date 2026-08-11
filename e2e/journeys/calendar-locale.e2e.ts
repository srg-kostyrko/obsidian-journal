import { $, browser, expect } from "@wdio/globals";

import { closeSettings, openSettings, submitModal, waitForModalOpen } from "../support/settings.js";

import { TIMELINE_BLOCK, TIMELINE_FENCE, plainNote, renderBlock } from "./code-blocks.js";
import { LIVE_LEAF, openSeededCalendarView } from "./view.js";

// The dashboard has two sections whose title starts with "Calendar" ("Calendar" and "Calendar
// highlighting"), so the week block's trigger needs an exact title match rather than a substring.
const CALENDAR_SECTION =
  '//div[contains(@class,"collapsible-trigger")][.//div[contains(@class,"iconed-row")][normalize-space(.)="Calendar"]]';

// The preset rows all carry a "Use" button; pick the one in the row with this preset's name.
function presetUseButton(preset: string): string {
  return `//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space(.)="${preset}"]]//button[normalize-space(.)="Use"]`;
}

// calendar.mode=custom with dow=1 calls moment.updateLocale(week.dow=1) at boot (CalendarSettingsBridge),
// which rotates the weekday header so Monday leads. NotesMonthView builds its weekday labels from
// moment's localeData via .format("ddd"); the first .notes-month-view__weekday must read "Mon". This
// is a global moment-locale effect that a unit/component test cannot exercise through real rendering.
describe("calendar locale", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-locale", plugins: ["journals"] });
  });

  it("starts the week on Monday when the custom first-day-of-week is Monday", async () => {
    await openSeededCalendarView();
    const firstWeekday = $(`${LIVE_LEAF} .notes-month-view__weekday`);
    await firstWeekday.waitForExist({ timeoutMsg: "the weekday header did not render" });
    expect(await firstWeekday.getText()).toBe("Mon");
  });

  // The week configuration lives in moment's locale registry, which Vue cannot observe: before
  // localMoment() bound it to a ref, an already-open view kept rendering Monday-first weeks until
  // some unrelated change happened to re-render it. The view stays mounted behind the settings
  // modal throughout, so a header that flips to Sunday can only come from a live re-render.
  it("re-renders an open view when the week preset changes", async () => {
    await openSeededCalendarView();
    const firstWeekday = $(`${LIVE_LEAF} .notes-month-view__weekday`);
    await firstWeekday.waitForExist({ timeoutMsg: "the weekday header did not render" });

    await openSettings();
    await $(CALENDAR_SECTION).click();
    await $("button=Change").click();
    await waitForModalOpen();
    await $(presetUseButton("Western traditional")).click();
    await submitModal();

    await browser.waitUntil(async () => (await firstWeekday.getText()) === "Sun", {
      timeoutMsg: "the open view kept its old week start after the preset changed",
    });
    await closeSettings();
  });

  // Code blocks mount their own Vue app per fence (VueCodeBlockHost) rather than sharing the
  // view leaf's, so the live update has to reach a rendered block too. Runs after the test
  // above, which left the preset on Western — this one changes it back to ISO 8601.
  it("re-renders a rendered code block when the week preset changes", async () => {
    const grid = `${TIMELINE_BLOCK} .notes-month-view`;
    await renderBlock("timeline/week-preset.md", plainNote(TIMELINE_FENCE), grid);
    // Reading mode can mount the block in more than one render context; the first copy is
    // offscreen, where getText() reads empty, so scope to one grid and read textContent.
    const firstWeekday = $(`${grid} .notes-month-view__weekday`);
    await firstWeekday.waitForExist({ timeoutMsg: "the timeline weekday header did not render" });
    const weekdayLabel = async (): Promise<string> => String(await firstWeekday.getProperty("textContent")).trim();
    expect(await weekdayLabel()).toBe("Sun");

    await openSettings();
    await $(CALENDAR_SECTION).click();
    await $("button=Change").click();
    await waitForModalOpen();
    await $(presetUseButton("ISO 8601")).click();
    await submitModal();

    await browser.waitUntil(async () => (await weekdayLabel()) === "Mon", {
      timeoutMsg: "the rendered code block kept its old week start after the preset changed",
    });
    await closeSettings();
  });
});
