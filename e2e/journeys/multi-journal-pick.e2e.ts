import { $, browser, expect } from "@wdio/globals";

import { forceNativeMenus, nativeMenuLabels, pickNativeItem, restoreMenus } from "../support/native-menu.js";
import { closeAllLeaves, noteExists, waitForActiveNote, waitForJournalFrontmatter } from "../support/vault.js";

import { dayAnchor } from "./decorations.js";
import { calendar, openCalendarView } from "./view.js";

// e2e-shelf-pick is issue #238's shape: two shelves, a day journal on each, and a calendar
// scoped to all journals. Every day is then covered by two journals, so clicking one cannot
// resolve to a single note and OpenDateFlow disambiguates through a menu at the pointer.
//
// That menu is the only one in the plugin whose *result* is a value: the picked name resolves
// a promise, and the menu closing has to decide whether to cancel it. Obsidian's two menu
// renderings put the pick on opposite sides of that close — the DOM menu runs the item
// callback and then hides, the native one hides on Electron's "menu-will-close" and lets the
// pick cross IPC afterwards — so the pick has to survive both orderings. It did not: on macOS,
// where `nativeMenus` defaults on, every pick arrived after the cancel and was discarded, and
// the calendar silently stopped creating notes for any date more than one journal covered.
//
// Both orderings are exercised here, on every OS. The native one is not simulated: it is the
// real code path, reached by flipping Obsidian's own static and capturing Electron's menu
// template (see ../support/native-menu.ts), with the close and the pick replayed in the order
// the main process sends them.
const NATIVE_ANCHOR = dayAnchor(12);
const DOM_ANCHOR = dayAnchor(13);

describe("multi-journal pick", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-shelf-pick", plugins: ["journals"] });
    await openCalendarView();
  });

  after(async () => {
    await restoreMenus();
    await closeAllLeaves();
  });

  // Picks the second entry in both tests below: resolving the choice by name is what they
  // prove, and a regression that silently took the first applicable journal would still pass
  // on "work".
  it("opens the journal picked from a native menu, which delivers the pick after it closes", async () => {
    // Inside the test body, not a hook: wdio.conf.mts resets the rendering before each test.
    await forceNativeMenus();
    expect(await noteExists(`personal/${NATIVE_ANCHOR}.md`)).toBe(false);

    await calendar.cell(NATIVE_ANCHOR).click();

    await browser.waitUntil(async () => (await nativeMenuLabels()).length > 0, {
      timeoutMsg: "the journal pick menu did not reach Electron",
    });
    expect(await nativeMenuLabels()).toEqual([["work", "personal"]]);

    await pickNativeItem(0, 1);

    await waitForActiveNote(`personal/${NATIVE_ANCHOR}.md`);
    await waitForJournalFrontmatter(`personal/${NATIVE_ANCHOR}.md`, {
      journal: "personal",
      date: NATIVE_ANCHOR,
    });
    expect(await noteExists(`work/${NATIVE_ANCHOR}.md`)).toBe(false);
  });

  it("opens the journal picked from a DOM menu, which delivers the pick before it closes", async () => {
    expect(await noteExists(`personal/${DOM_ANCHOR}.md`)).toBe(false);

    await calendar.cell(DOM_ANCHOR).click();

    await $(".menu").waitForExist({ timeoutMsg: "the journal pick menu did not render in the document" });
    const titles = await browser.execute(() =>
      [...document.querySelectorAll(".menu-item-title")].map((el) => el.textContent ?? ""),
    );
    expect(titles).toEqual(["work", "personal"]);

    await $(".menu-item-title=personal").click();

    await waitForActiveNote(`personal/${DOM_ANCHOR}.md`);
    await waitForJournalFrontmatter(`personal/${DOM_ANCHOR}.md`, { journal: "personal", date: DOM_ANCHOR });
    expect(await noteExists(`work/${DOM_ANCHOR}.md`)).toBe(false);
  });
});
