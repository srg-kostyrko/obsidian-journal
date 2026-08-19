import { browser } from "@wdio/globals";

import { seedNote, writeNote } from "../support/vault.js";

import { dayAnchor, expectDecorated, expectUndecorated, note } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

// The note-size condition's value is produced asynchronously — NoteSizeService reads the
// file, counts, caches, and emits size-changed, which repaints the cell — so the decoration
// is absent on first paint by design. That asynchronous timing against a real Obsidian boot,
// not the mock, is what this file exists to cover; see docs/e2e-testing-strategy.md.
//
// A dedicated fixture (e2e/fixtures/e2e-note-size), not the shared e2e-journeys one: its
// daily journal carries two note-size decorations (both corner-style, so they render through
// the shared LIVE_DECORATION handle) that this spec alone seeds notes against —
//   - words gt 5  — the one this spec's long note is meant to clear.
//   - words lt 1  — live on the same render for the no-note assertion below.
// Keeping them off e2e-journeys matters: that fixture's other specs seed daily notes with
// the default empty body (0 words), which a "words lt 1" condition would wrongly decorate.
const LONG_BODY = "one two three four five six seven eight nine ten";
const SHORT_BODY = "one two";

const DAY_WITH_LONG_NOTE = 24;
const DAY_WITH_NO_NOTE = 26;

describe("note size decoration condition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-note-size", plugins: ["journals"] });
  });

  it("decorates a note once its size read resolves, leaves a note-free day undecorated on the same render, and clears once a rewrite drops the count back under the threshold", async () => {
    const anchor = dayAnchor(DAY_WITH_LONG_NOTE);
    const path = `${anchor}.md`;
    await seedNote(path, note("daily", anchor, LONG_BODY));

    await openSeededCalendarView();

    // Cell A: a note whose word count (10) clears the fixture's "words gt 5" condition.
    // The decoration is absent on first paint and lands once NoteSizeService's async read
    // resolves and emits size-changed — expectDecorated polls for exactly that.
    await expectDecorated(calendar.cell(anchor));

    // Cell B: no note at all, evaluated against the fixture's "words lt 1" condition.
    // expectUndecorated is waitForExist({reverse: true}), which succeeds immediately when
    // the element is absent — on its own this would pass at t=0 with the whole feature
    // deleted. Ordering it after cell A's assertion is what makes it a verdict: a "cache
    // miss treated as zero" bug would paint this cell on the first *synchronous* evaluation
    // pass, strictly before any file read could land, so by the time cell A proved this
    // render's async fills resolved, a broken cell B would already be wrong and visible.
    await expectUndecorated(calendar.cell(dayAnchor(DAY_WITH_NO_NOTE)));

    // The only place modified -> refill -> size-changed is exercised against the real host:
    // rewriting the note's body below the threshold must clear the decoration again.
    await writeNote(path, note("daily", anchor, SHORT_BODY));

    await expectUndecorated(calendar.cell(anchor));
  });
});
