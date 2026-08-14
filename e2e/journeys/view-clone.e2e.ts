import { $, browser } from "@wdio/globals";

import {
  clickIcon,
  closeSettings,
  expandSection,
  goBack,
  openSettings,
  setModalNumber,
  submitModal,
} from "../support/settings.js";

// Cloning a view deep-copies each block's config out of the reactive settings store. A block's
// config editor spreads that store object, so a sibling array (the month block's hiddenWeekdays)
// is read back as a Vue reactive proxy embedded at depth. structuredClone rejects proxies and a
// shallow toRaw only unwraps the top level, so the clone threw "DataCloneError: ... could not be
// cloned" and silently produced no copy. Only the real reactive store embeds that nested proxy —
// the unit harness seeds plain objects — so this seam lives in e2e: edit the default Calendar
// view's month block (persisting the embedded proxy), then clone it from the dashboard.

describe("view clone", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  after(closeSettings);

  it("clones a view whose block config was edited through the reactive store", async () => {
    await openSettings();
    await expandSection("Views");

    // Open the default Calendar view's editor and change a primitive month-block field. Saving
    // routes the spread-embedded reactive hiddenWeekdays proxy back into the store, which is the
    // state the clone must survive.
    await clickIcon("Configure Calendar");
    await clickIcon("Edit block"); // the first editable block is the month calendar
    await setModalNumber(1); // the leading-padding field — a primitive change that leaves hiddenWeekdays spread as a proxy
    await submitModal();
    // The updated summary confirms the edited config persisted before we leave the editor.
    // (Zero-count sides are hidden from the summary, so "after: 0" does not appear.)
    await $(".jv-block-entry*=1 before").waitForExist({
      timeoutMsg: "month block summary did not reflect the saved padding change",
    });
    await goBack();

    // Back on the dashboard, cloning the edited view must add "Calendar (copy)" rather than throw
    // DataCloneError and silently drop the clone — the copy's own clone button is the proof it exists.
    await expandSection("Views");
    await clickIcon("Clone Calendar");

    await $('button[aria-label="Clone Calendar (copy)"]').waitForExist({
      timeoutMsg: "clone did not add a Calendar (copy) view — clone likely threw DataCloneError",
    });
  });
});
