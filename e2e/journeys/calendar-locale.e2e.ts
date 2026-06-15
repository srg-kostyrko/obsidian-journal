import { $, browser, expect } from "@wdio/globals";

import { LIVE_LEAF, openCalendarView } from "./view.js";

// calendar.mode=custom with dow=1 calls moment.updateLocale(week.dow=1) at boot (CalendarSettingsBridge),
// which rotates the weekday header so Monday leads. NotesMonthView builds its weekday labels from
// moment's localeData via .format("ddd"); the first .notes-month-view__weekday must read "Mon". This
// is a global moment-locale effect that a unit/component test cannot exercise through real rendering.
describe("calendar locale", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-locale", plugins: ["journals"] });
  });

  it("starts the week on Monday when the custom first-day-of-week is Monday", async () => {
    await openCalendarView();
    const firstWeekday = $(`${LIVE_LEAF} .notes-month-view__weekday`);
    await firstWeekday.waitForExist({ timeoutMsg: "the weekday header did not render" });
    expect(await firstWeekday.getText()).toBe("Mon");
  });
});
