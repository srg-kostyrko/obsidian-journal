import { browser, expect } from "@wdio/globals";

import { seedNote } from "../support/vault.js";

import { dayAnchor, expectDecorated, expectUndecorated, note } from "./decorations.js";
import { calendar, openSeededCalendarView } from "./view.js";

// Obsidian's "Date & time" property widget stores "YYYY-MM-DDTHH:mm:ss", while a date
// condition's own value can only ever be date-only — the editor renders <input type="date">.
// Comparing the two as whole strings inverted half the operators (#374), and whether that was a
// bug at all depended on what the *real* host caches for an unquoted ISO datetime:
// __mocks__/obsidian.ts stores whatever a test hands it, so only Obsidian itself can settle it.
//
// A dedicated fixture (e2e/fixtures/e2e-datetime-deco), not the shared e2e-journeys one: its
// daily journal carries three date-property decorations (all corner-style, so they render
// through the shared LIVE_DECORATION handle) keyed off a fixed 2026-07-30. The property value
// is ordinary frontmatter, unrelated to the cell's own date, so the condition can stay a literal
// in the fixture while the cells stay in whatever month the run happens to open on.
//
// The is-not decoration is ANDed with an exists on the same property, because checkProperty
// satisfies neq for a note that simply lacks the property — without the guard that decoration
// paints every daily note in the fixture and the assertions below all pass with the bug in place.
const CONDITION_DATE = "2026-07-30";
const WITH_TIME = `${CONDITION_DATE}T08:10:00`;

const DAY = {
  dateOnly: 4,
  dateTime: 11,
  boundary: 18,
  isNot: 25,
} as const;

// The WebDriver wire turns a Date into a string, so a test that only read the frontmatter back
// could not tell the two shapes apart. The classification has to happen in the host.
function cachedShapeOf(path: string, property: string): Promise<{ kind: string; text: string } | undefined> {
  return browser.executeObsidian(
    ({ app, obsidian }, notePath, key) => {
      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof obsidian.TFile)) return;
      const raw: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[key];
      return { kind: raw instanceof Date ? "date" : typeof raw, text: String(raw) };
    },
    path,
    property,
  );
}

async function seedDay(day: number, property: string, value: string): Promise<void> {
  const anchor = dayAnchor(day);
  await seedNote(`${anchor}.md`, note("daily", anchor, "", [`${property}: ${value}`]));
}

describe("date-and-time property decoration conditions", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-datetime-deco", plugins: ["journals"] });

    await seedDay(DAY.dateOnly, "reviewed-eq", CONDITION_DATE);
    await seedDay(DAY.dateTime, "reviewed-eq", WITH_TIME);
    await seedDay(DAY.boundary, "reviewed-lte", `${CONDITION_DATE}T23:59:00`);
    await seedDay(DAY.isNot, "reviewed-neq", WITH_TIME);

    await openSeededCalendarView();
  });

  // The control runs first, so the failures below are a verdict about the time suffix rather
  // than about the fixture, the seeding, or the decoration pipeline.
  it("decorates a day whose date-only property equals the condition's date", async () => {
    await expectDecorated(calendar.cell(dayAnchor(DAY.dateOnly)));
  });

  it("decorates a day whose date-and-time property falls on the condition's date", async () => {
    await expectDecorated(calendar.cell(dayAnchor(DAY.dateTime)));
  });

  it("decorates a day whose date-and-time property falls on the boundary of an on-or-before comparison", async () => {
    await expectDecorated(calendar.cell(dayAnchor(DAY.boundary)));
  });

  // The complement: "is not 30 July" matched *every* note while the time rode along. This
  // assertion is reverse-waitForExist, which would also pass at t=0 with the feature deleted —
  // the decorated assertions above are what prove this render already evaluated its conditions.
  it("leaves a day undecorated whose date-and-time property fails an is-not comparison", async () => {
    await expectUndecorated(calendar.cell(dayAnchor(DAY.isNot)));
  });

  // Pins the host shape the comparison's correctness rests on: the string branch is the live one
  // and the Date branch is dead for this input. If Obsidian ever starts caching a Date here, this
  // says so instead of the decorations quietly changing granularity.
  it("records what the host actually caches for an unquoted date-and-time value", async () => {
    await expect(cachedShapeOf(`${dayAnchor(DAY.dateTime)}.md`, "reviewed-eq")).resolves.toEqual({
      kind: "string",
      text: WITH_TIME,
    });
  });
});
