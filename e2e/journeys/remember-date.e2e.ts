import { $, browser, expect } from "@wdio/globals";

import { getSettings, waitForSettings } from "../support/plugin-data.js";
import { clickIcon, closeSettings, expandSection, openSettings, toggleSettingRow } from "../support/settings.js";
import { waitForState } from "../support/wait.js";

import { calendar, openCalendarView, TOOLBAR } from "./view.js";

// #82: whether the calendar reopens on the last viewed date after a restart is a per-view
// setting (rememberDate). Obsidian serializes each leaf's getState() into the workspace layout
// it persists and restores on restart, so reading the journal-view leaf's refDate out of
// getLayout() observes exactly what a restart would restore — the faithful proxy the harness
// allows, since reloadObsidian re-copies the fixture and cannot replay a navigated layout.

const headerMonthAnchor = async (): Promise<string | undefined> =>
  (await calendar.periodCell("header-month").getAttribute("data-anchor")) ?? undefined;

const persistedRefDate = async (): Promise<string | null> =>
  browser.executeObsidian(({ app }) => {
    let found: string | null = null;
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      const leafState = record.state as Record<string, unknown> | undefined;
      if (record.type === "leaf" && typeof leafState?.type === "string" && leafState.type.startsWith("journal-view:")) {
        const inner = leafState.state as Record<string, unknown> | undefined;
        if (typeof inner?.refDate === "string") found = inner.refDate;
      }
      for (const value of Object.values(record)) walk(value);
    };
    walk(app.workspace.getLayout());
    return found;
  });

async function navigateToNextMonth(): Promise<void> {
  const start = await headerMonthAnchor();
  await $(`${TOOLBAR} [aria-label="Next month"]`).click();
  await waitForState(headerMonthAnchor, (anchor) => anchor !== start, "header-month did not advance");
}

function viewIdByName(views: Record<string, { name?: string }> | undefined, name: string): string | undefined {
  return Object.keys(views ?? {}).find((id) => views?.[id]?.name === name);
}

describe("calendar view remember-date", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  it("does not persist the viewed date when remember is off (default)", async () => {
    await openCalendarView();

    await navigateToNextMonth();

    // The leaf holds the navigated date in memory, but getState omits it, so a restart would
    // reopen on today — the layout carries no refDate.
    expect(await persistedRefDate()).toBe(null);
  });

  it("persists the viewed date when remember is turned on", async () => {
    await openSettings();
    await expandSection("Views");
    await clickIcon("Configure Calendar");
    await toggleSettingRow("Remember last viewed date");
    const settings = await getSettings();
    const calId = viewIdByName(settings.views, "Calendar") ?? "";
    await waitForSettings(
      (s) => (s.views?.[calId] as { rememberDate?: boolean } | undefined)?.rememberDate === true,
      "rememberDate was not persisted after toggling it on",
    );
    await closeSettings();

    await openCalendarView();
    await navigateToNextMonth();

    // A restart would restore this date: the layout now carries a refDate inside the shown month.
    const persisted = await persistedRefDate();
    const displayed = await headerMonthAnchor();
    expect(persisted).not.toBe(null);
    expect(persisted?.slice(0, 7)).toBe(displayed?.slice(0, 7));
  });
});
