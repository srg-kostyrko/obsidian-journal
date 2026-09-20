import { $, $$, browser } from "@wdio/globals";

import { decorationBackgroundHex, note } from "../journeys/decorations.js";
import { calendar, MONTH_VIEW, openSeededCalendarView } from "../journeys/view.js";
import { reloadObsidianOn } from "../support/clock.js";
import { getSettings } from "../support/plugin-data.js";
import { closeSettings, expandSection, openSettings } from "../support/settings.js";
import { contentOf, seedNote } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { captureThemed, recordOutcome, widenRightSidebar } from "./capture.js";

const CHECKBOX_TRUE_HEX = "#2e7d32";
const CHECKBOX_FALSE_HEX = "#888888";

// The day the committed images show as today; decorations.md quotes no date of its own.
const TODAY = "2026-09-13";

// Exactly `n` whitespace-separated tokens, matching how Obsidian's own status-bar word count
// (and the note-size condition it feeds) counts a note — see note-size-decoration.e2e.ts.
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

// Anchors are always plain YYYY-MM-DD, so no CSS.escape is needed when the selector is built
// here (Node-side) rather than inside browser.execute.
function monthCellSelector(anchor: string): string {
  return `${MONTH_VIEW} .notes-month-view__day[data-anchor="${anchor}"]`;
}

function markCount(cellSelector: string, place: string): Promise<number> {
  return browser.execute(
    (root: string, placeClass: string) =>
      document.querySelectorAll(`${root} .place-${placeClass} .shape-decoration`).length,
    cellSelector,
    place,
  );
}

function overflowBadgeText(cellSelector: string, place: string): Promise<string | null> {
  return browser.execute(
    (root: string, placeClass: string) =>
      document.querySelector(`${root} .place-${placeClass} .mark-overflow__count`)?.textContent?.trim() ?? null,
    cellSelector,
    place,
  );
}

interface DecorationStyle {
  type: string;
  color?: { color?: string };
  placement_x?: string;
  placement_y?: string;
}
interface DecoratedEntity {
  decorations?: { styles?: DecorationStyle[] }[];
}
interface DecoratedSettings {
  journals?: Record<string, DecoratedEntity>;
  shelves?: Record<string, DecoratedEntity>;
}

function stylesOfType(entity: DecoratedEntity | undefined, type: string): DecorationStyle[] {
  return (entity?.decorations ?? []).flatMap((binding) => binding.styles?.filter((style) => style.type === type) ?? []);
}

// Read the mark cap fixture's own persisted config rather than hardcoding the colors and counts
// it configures, so a change to e2e-docs-decorations-cap's data.json can't silently drift from
// what the outcome JSON claims. getSettings()'s StoredSettings type doesn't model decoration
// styles, so this widens locally to the shape it actually reads.
async function capDecorationSummary(): Promise<{
  journalBackground: string | undefined;
  shelfBackground: string | undefined;
  rightTopConfigured: number;
  leftBottomConfigured: number;
}> {
  const settings = (await getSettings()) as unknown as DecoratedSettings;
  const journal = settings.journals?.daily;
  const shelf = settings.shelves?.["cap-shelf"];
  const shapes = stylesOfType(journal, "shape");
  return {
    journalBackground: stylesOfType(journal, "background")[0]?.color?.color,
    shelfBackground: stylesOfType(shelf, "background")[0]?.color?.color,
    rightTopConfigured: shapes.filter((style) => style.placement_x === "right" && style.placement_y === "top").length,
    leftBottomConfigured: shapes.filter((style) => style.placement_x === "left" && style.placement_y === "bottom")
      .length,
  };
}

// The "Marks shown per position" dropdown (CalendarDecorationsBlock.vue) carries no
// aria-label, so it is located the way toggleSettingRow locates a row with no label of its
// own: by its visible setting-item-name text, scoped with an XPath the way settings.ts's own
// helpers do.
async function setMarkLimit(value: "0" | "3"): Promise<void> {
  await openSettings();
  await expandSection("Calendar decorations");
  await $(
    `//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space(.)="Marks shown per position"]]//select`,
  ).selectByAttribute("value", value);
  await closeSettings();
}

describe("decorations examples", () => {
  describe("checkbox property (#201)", () => {
    before(async () => {
      await reloadObsidianOn(TODAY, {
        vault: "./e2e-tests/fixtures/e2e-docs-decorations-checkbox",
        plugins: ["journals"],
      });
    });

    it("paints true green, false grey, and leaves an absent or valueless checkbox undecorated", async () => {
      await openSeededCalendarView();

      const trueDay = "2026-09-02";
      const falseDay = "2026-09-03";
      const absentDay = "2026-09-04";
      const emptyDay = "2026-09-05";

      await seedNote(`${trueDay}.md`, note("daily", trueDay, "", ["workout: true"]));
      await seedNote(`${falseDay}.md`, note("daily", falseDay, "", ["workout: false"]));
      await seedNote(`${absentDay}.md`, note("daily", absentDay));
      // A property present with no value at all: `workout:` parses as YAML null, which
      // Object.hasOwn reports as present but is neither `true` nor `false` (engine-checks.ts).
      await seedNote(`${emptyDay}.md`, note("daily", emptyDay, "", ["workout:"]));

      await waitForState(
        () => decorationBackgroundHex(calendar.cell(trueDay)),
        (hex) => hex === CHECKBOX_TRUE_HEX,
        "waited for the workout:true cell to paint green",
      );
      await waitForState(
        () => decorationBackgroundHex(calendar.cell(falseDay)),
        (hex) => hex === CHECKBOX_FALSE_HEX,
        "waited for the workout:false cell to paint grey",
      );

      const styles = {
        true: await decorationBackgroundHex(calendar.cell(trueDay)),
        false: await decorationBackgroundHex(calendar.cell(falseDay)),
        absent: await decorationBackgroundHex(calendar.cell(absentDay)),
        empty: await decorationBackgroundHex(calendar.cell(emptyDay)),
      };

      await recordOutcome("decorations-checkbox", {
        property: "workout",
        days: { trueDay, falseDay, absentDay, emptyDay },
        styles,
      });
    });

    it("records the raw frontmatter Obsidian writes for a checkbox property added through its own property UI, left unchecked", async () => {
      const anchor = "2026-09-06";
      const path = `${anchor}.md`;
      await seedNote(path, note("daily", anchor));

      await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
        const file = app.vault.getAbstractFileByPath(notePath);
        if (file instanceof obsidian.TFile) await app.workspace.getLeaf(false).openFile(file);
      }, path);

      const metadataContainer = $(".workspace-leaf.mod-active .metadata-container");
      await metadataContainer.waitForExist({ timeoutMsg: "properties editor did not render for the active note" });

      const rowsBefore = await metadataContainer.$$(".metadata-property").length;
      const addButton = metadataContainer.$(".metadata-add-button");
      await addButton.waitForExist({ timeoutMsg: "Add property button not found" });
      await addButton.click();

      // A new row is appended to the property list — the ONLY reliable way to find it, since
      // it carries no name or id of its own until the key is typed and committed. Picking the
      // first `.metadata-property-key-input` on the page (there is one per existing property,
      // e.g. "journal") would type into the wrong row. Marking the last row in-page (rather
      // than indexing a resolved element array) keeps every WDIO handle below a plain,
      // always-defined `$()` lookup instead of a possibly-undefined array element.
      await browser.waitUntil(async () => (await metadataContainer.$$(".metadata-property").length) > rowsBefore, {
        timeoutMsg: "new property row did not appear after clicking Add property",
      });
      await browser.execute(() => {
        [...document.querySelectorAll(".metadata-property")].at(-1)?.setAttribute("data-e2e-new-row", "true");
      });
      const newRow = metadataContainer.$('.metadata-property[data-e2e-new-row="true"]');
      await newRow.waitForExist({ timeoutMsg: "marked new property row not found" });

      const keyInput = newRow.$(".metadata-property-key-input");
      await keyInput.waitForExist({ timeoutMsg: "new property key input did not appear" });
      await keyInput.setValue("workout");
      await browser.keys("Tab");

      // Change the new row's type to Checkbox via its type-picker menu (the property icon
      // to the left of the key).
      const propertyIcon = newRow.$(".metadata-property-icon");
      await propertyIcon.waitForExist({ timeoutMsg: "workout property row did not render" });
      await propertyIcon.click();
      const menu = $(".menu");
      await menu.waitForExist({ timeoutMsg: "property type menu did not open" });

      // The type list is a nested submenu behind a "Property type" trigger, not top-level
      // items — Obsidian's Menu opens a submenu on hover, matching its Electron-style menus.
      const typeTrigger = menu.$(".menu-item-title*=Property type");
      await typeTrigger.waitForExist({ timeoutMsg: "Property type submenu trigger not found" });
      await typeTrigger.moveTo();

      await browser.waitUntil(async () => (await $$(".menu").length) > 1, {
        timeoutMsg: "Property type submenu did not open on hover",
      });
      await browser.execute(() => {
        [...document.querySelectorAll(".menu")].at(-1)?.setAttribute("data-e2e-submenu", "true");
      });
      const submenu = $('.menu[data-e2e-submenu="true"]');
      await submenu.waitForExist({ timeoutMsg: "marked property-type submenu not found" });
      const checkboxItem = submenu.$(".menu-item-title*=Checkbox");
      await checkboxItem.waitForExist({ timeoutMsg: "Checkbox type option not found in property type submenu" });
      await checkboxItem.click();

      // A type change onto a value the widget rejects (here: null) can pop a confirmation
      // dialog; accept it if Obsidian shows one so the type change actually commits.
      const confirmButton = $(".modal-container .mod-cta");
      if (await confirmButton.isExisting()) await confirmButton.click();

      await browser.pause(300);
      const content = await contentOf(path);
      const registeredWidget = await browser.executeObsidian(({ app }) => {
        const manager = app as unknown as {
          metadataTypeManager?: { getAllProperties?: () => Record<string, { widget?: string }> };
        };
        return manager.metadataTypeManager?.getAllProperties?.().workout?.widget;
      });
      const outcome = { path, content, registeredWidget };

      await recordOutcome("decorations-checkbox-ui-add", outcome);
    });
  });

  describe("word-count bands and ladder (#105)", () => {
    before(async () => {
      await reloadObsidianOn(TODAY, {
        vault: "./e2e-tests/fixtures/e2e-docs-decorations-word-count",
        plugins: ["journals"],
      });
    });

    it("stacks a growing row of ladder dots and shows a single band dot, capped and uncapped", async () => {
      // At the default sidebar width, the 1300-word cell's two visible ladder dots collapse to
      // zero width next to the +3 overflow badge (CellMarks.vue's flex row has no room to fit a
      // fixed-size badge alongside two shapes at ~50px/column) — the badge alone is enough for
      // markCount() to see 2 elements in the DOM, but not enough for either to actually paint.
      // Widen the split so every cell has room for its dots.
      //
      // Today's auto-selected cell carries a ring that would cover whatever dots sit under it, so
      // the seeded days stay clear of it.
      const monthPrefix = TODAY.slice(0, 7);
      const day100 = "2026-09-01";
      const day600 = "2026-09-02";
      const day800 = "2026-09-03";
      const day1300 = "2026-09-04";

      const openBoard = async (): Promise<void> => {
        await openSeededCalendarView();
        await widenRightSidebar(600, MONTH_VIEW);
      };

      await openBoard();

      await seedNote(`${day100}.md`, note("daily", day100, words(100)));
      await seedNote(`${day600}.md`, note("daily", day600, words(600)));
      await seedNote(`${day800}.md`, note("daily", day800, words(800)));
      await seedNote(`${day1300}.md`, note("daily", day1300, words(1300)));

      // Note-size reads resolve asynchronously; wait for the fullest cell (1300 words, 5
      // ladder marks) to settle before reading any cell, the same ordering
      // note-size-decoration.e2e.ts relies on.
      await waitForState(
        () => markCount(monthCellSelector(day1300), "center_bottom"),
        (n) => n === 2, // capped at the default limit of 3: 5 marks -> 2 visible + a badge
        "waited for the 1300-word cell's ladder marks to settle under the default cap",
      );

      const readAll = async (): Promise<Record<string, unknown>> => ({
        ladder: {
          [100]: await markCount(monthCellSelector(day100), "center_bottom"),
          [600]: await markCount(monthCellSelector(day600), "center_bottom"),
          [800]: await markCount(monthCellSelector(day800), "center_bottom"),
          [1300]: await markCount(monthCellSelector(day1300), "center_bottom"),
        },
        ladderOverflowBadge: {
          [100]: await overflowBadgeText(monthCellSelector(day100), "center_bottom"),
          [600]: await overflowBadgeText(monthCellSelector(day600), "center_bottom"),
          [800]: await overflowBadgeText(monthCellSelector(day800), "center_bottom"),
          [1300]: await overflowBadgeText(monthCellSelector(day1300), "center_bottom"),
        },
        band: {
          [100]: await markCount(monthCellSelector(day100), "left_top"),
          [600]: await markCount(monthCellSelector(day600), "left_top"),
          [800]: await markCount(monthCellSelector(day800), "left_top"),
          [1300]: await markCount(monthCellSelector(day1300), "left_top"),
        },
      });

      const atCap3 = await readAll();

      await captureThemed(MONTH_VIEW, "decorations-word-count");

      // The uncapped reading needs no screenshot, so it can safely open Settings in this same
      // (already captured) session.
      await setMarkLimit("0");
      await openSeededCalendarView();
      await waitForState(
        () => markCount(monthCellSelector(day1300), "center_bottom"),
        (n) => n === 5,
        "waited for the 1300-word cell's ladder marks to show uncapped",
      );
      const atUnlimited = await readAll();

      await recordOutcome("decorations-word-count", {
        month: monthPrefix,
        days: { 100: day100, 600: day600, 800: day800, 1300: day1300 },
        atCap3,
        atUnlimited,
      });
    });
  });

  describe("shelf/journal cascade and the mark cap (#186)", () => {
    before(async () => {
      await reloadObsidianOn(TODAY, { vault: "./e2e-tests/fixtures/e2e-docs-decorations-cap", plugins: ["journals"] });
    });

    it("lets the journal's background win over the shelf's, and caps marks with a badge", async () => {
      const today = TODAY;
      const todayCell = monthCellSelector(today);

      // 720px gives each of the grid's 7 columns roughly 100px — enough for a day number, two
      // kept circles and a +3 badge at one corner, and two kept squares and a +10 badge at the
      // opposite corner, all at once.
      const openBoard = async (): Promise<void> => {
        await openSeededCalendarView();
        await widenRightSidebar(720, MONTH_VIEW);
        await waitForState(
          () => decorationBackgroundHex($(todayCell)),
          (hex) => hex !== undefined,
          "waited for today's cell to paint a background",
        );
      };

      await openBoard();

      const winningBackground = await decorationBackgroundHex($(todayCell));
      const rightTopVisible = await markCount(todayCell, "right_top");
      const rightTopBadge = await overflowBadgeText(todayCell, "right_top");
      const leftBottomVisible = await markCount(todayCell, "left_bottom");
      const leftBottomBadge = await overflowBadgeText(todayCell, "left_bottom");
      const { journalBackground, shelfBackground, rightTopConfigured, leftBottomConfigured } =
        await capDecorationSummary();

      await captureThemed(MONTH_VIEW, "decorations-cap");

      await recordOutcome("decorations-cap", {
        today,
        journalBackground,
        shelfBackground,
        winningBackground,
        marks: {
          rightTop: { visible: rightTopVisible, badge: rightTopBadge, totalConfigured: rightTopConfigured },
          leftBottom: { visible: leftBottomVisible, badge: leftBottomBadge, totalConfigured: leftBottomConfigured },
        },
      });
    });
  });
});
