import { browser } from "@wdio/globals";

import { seedNote } from "../support/vault.js";

import { dayAnchor, expectBackgroundHex, expectDecorated, expectUndecorated, STYLE_HEX } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

// The has-notelet condition reads JournalsIndex's notelet side, which is populated from
// metadataCache — and JournalsIndex is not Vue-reactive, so the cell repaints only if the
// index's entryChanged event reaches useCellDecorations. A notelet indexed *after* the view
// mounted is the case that catches a missing bridge; a fixture seeded before mount passes with
// the bridge deleted, which is why the live seed below is the load-bearing assertion.
//
// The fixture's daily journal carries two has-notelet decorations:
//   - typeIds [] (any type)  -> a red corner, the shared expectDecorated handle
//   - typeIds ["retro"]      -> a background, so a typed condition can be told from the any one
const DAY_WITH_MEETING = 5;
const DAY_WITH_RETRO = 12;
const DAY_WITH_NO_NOTELET = 19;
const DAY_INDEXED_LIVE = 21;

function notelet(anchor: string, type: string): string {
  return `---\njournal: daily\njournal-date: ${anchor}\njournal-notelet: ${type}\n---\n`;
}

describe("has-notelet decoration condition", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelet-deco", plugins: ["journals"] });
  });

  it("decorates a day holding a notelet and leaves a notelet-free day alone", async () => {
    const withMeeting = dayAnchor(DAY_WITH_MEETING);
    await seedNote(`notelets/${withMeeting} Meeting 1.md`, notelet(withMeeting, "Meeting"));

    await openSeededCalendarView();

    await expectDecorated(calendar.cell(withMeeting));
    // Ordered after the positive assertion, so this render is known to have resolved its
    // notelet reads before the negative is read — otherwise it would pass at t=0.
    await expectUndecorated(calendar.cell(dayAnchor(DAY_WITH_NO_NOTELET)));
  });

  it("paints a type-scoped condition only on the days that type reaches", async () => {
    const withRetro = dayAnchor(DAY_WITH_RETRO);
    await seedNote(`notelets/${withRetro} Retro.md`, notelet(withRetro, "Retro"));

    await openSeededCalendarView();

    await expectBackgroundHex(calendar.cell(withRetro), STYLE_HEX.background);
    // A Meeting satisfies the any-type rule but not the Retro-scoped one, so the day is
    // decorated (previous test) yet must not carry the typed rule's background.
    await expectDecorated(calendar.cell(dayAnchor(DAY_WITH_MEETING)));
  });

  // The reactivity case: the notelet arrives after the view is on screen, so the cell repaints
  // only if the index's change event reaches the decoration cache.
  it("repaints a cell when a notelet is indexed while the calendar is open", async () => {
    const live = dayAnchor(DAY_INDEXED_LIVE);
    await openSeededCalendarView();
    await expectUndecorated(calendar.cell(live));

    await seedNote(`notelets/${live} Meeting 1.md`, notelet(live, "Meeting"));

    await expectDecorated(calendar.cell(live));
  });
});
