import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { reloadObsidianOn } from "../support/clock.js";
import { clickSectionButton, closeSettings, openSettings } from "../support/settings.js";
import { waitForState } from "../support/wait.js";

import { labelHexOf } from "./calendar.js";

type Width = "wide" | "narrow";
type PartKey = "today" | "outside" | "cell";

// The editor writes the appearance slice and the calendar reads it back through the saved body
// variables, so each case drives the subpage's controls and reads the rendered view, never the slice.
// Pinned so the view can page to a month where today is an outside day: April 2027 starts on a
// Thursday under either week start, so 31 March leads its grid.
const PINNED_TODAY = "2027-03-31";
// Outside April 2027 and not today, under either week start.
const OUTSIDE_PLAIN = "2027-03-30";

const VIEW_ID = "3e8b5c1a-7d2f-4a9e-b6c0-1f2e3d4c5b6a";
const ROOT = `[data-journal-view="${VIEW_ID}"]`;
// The fixture's own tooltip on the view's paging button, not a translated string.
const NEXT_MONTH = `${ROOT} [aria-label="Editor next month"]`;

const TODAY_TEXT = "#563412";
const OUTSIDE_TEXT = "#3a5f7d";
const WIDE_HEIGHT = 34;
const NARROW_HEIGHT = 40;
// The sidebar itself sits below the breakpoint, so both widths are forced on the block root.
const NARROW_WIDTH = "300px";
const WIDE_WIDTH = "700px";
const PREVIEW_WIDTH: Readonly<Record<Width, string>> = { wide: "100%", narrow: "260px" };

const SAVED_PREFIX = "--journal-saved-cell-";

const daySelector = (anchor: string): string => `${ROOT} .notes-month-view__day[data-anchor="${anchor}"]`;

class EditorReadError extends Error {
  override name = "EditorReadError";
}

// Polls `read` until it yields `expected`; a timeout names the last value read.
async function expectRead<T>(read: () => Promise<T | undefined>, expected: T, message: string): Promise<void> {
  let last: T | undefined;
  await waitForState(
    async () => {
      last = await read();
      return last;
    },
    (value) => value === expected,
    message,
  ).catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith(message)) {
      throw new EditorReadError(`${message}: read ${String(last)}`, { cause: error });
    }
    throw error;
  });
}

async function openView(): Promise<void> {
  // Revealed, not only placed: the right sidebar boots collapsed, and a collapsed split lays
  // nothing out, so no container query would match.
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: `journal-view:${id}`, active: true });
    await app.workspace.revealLeaf(leaf);
  }, VIEW_ID);
  await $(`${ROOT} .notes-month-view__day`).waitForDisplayed({ timeoutMsg: "the editor's target view showed no day" });
}

async function detachView(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    for (const leaf of app.workspace.getLeavesOfType(`journal-view:${id}`)) leaf.detach();
  }, VIEW_ID);
}

const firstDayAnchor = (): Promise<string | null> => $(`${ROOT} .notes-month-view__day`).getAttribute("data-anchor");

// A DOM click: the settings modal's overlay sits over the sidebar for the whole spec.
async function pageViewForward(): Promise<void> {
  const before = await firstDayAnchor();
  await browser.execute((selector: string) => {
    document.querySelector<HTMLElement>(selector)?.click();
  }, NEXT_MONTH);
  await waitForState(firstDayAnchor, (anchor) => anchor !== before, "the view did not page to the next month");
}

async function openEditor(): Promise<void> {
  await openSettings();
  await clickSectionButton(m.calendar_appearance_section_title(), m.calendar_appearance_open());
  await $(".appearance-preview").waitForDisplayed({ timeoutMsg: "the appearance subpage showed no preview" });
}

const previewWidth = (): Promise<string> =>
  browser.execute(() => document.querySelector<HTMLElement>(".appearance-preview")?.style.width ?? "");

async function chooseWidth(width: Width): Promise<void> {
  await $(`.ui-segmented-control__label=${m.calendar_appearance_width({ width })}`).click();
  await expectRead(previewWidth, PREVIEW_WIDTH[width], `the preview did not switch to ${width}`);
}

const partsList = () => $(`select[aria-label="${m.calendar_appearance_part_label()}"]`);

async function chooseFromList(part: PartKey): Promise<void> {
  await partsList().selectByAttribute("value", part);
}

// Clicks a cell of the preview, then the part's "also here" chip when the click edits another part.
async function pickInPreview(cellSelector: string, part: PartKey): Promise<void> {
  await $(`.appearance-preview ${cellSelector}`).click();
  const name = m.calendar_appearance_part({ part });
  const chip = $(`//button[contains(@class,"appearance-subpage__chip")][starts-with(normalize-space(.), "${name}")]`);
  if (await chip.isExisting()) await chip.click();
  await waitForState(
    () => partsList().getValue(),
    (value) => value === part,
    `${name} did not become the edited part`,
  );
}

// The control's row, by its visible label; a "Narrow only" tag may follow the label.
const controlRowPath = (label: string): string =>
  `//div[contains(@class,"appearance-control")][.//div[contains(@class,"setting-item-name")][starts-with(normalize-space(.), "${label}")]]`;

const TEXT_COLOR = m.calendar_appearance_control({ control: "highlight_text_color" });
const ROW_HEIGHT = m.calendar_appearance_control({ control: "box_min_height" });

async function chooseColorKind(label: string, kind: "custom" | "unchanged"): Promise<void> {
  await $(controlRowPath(label)).$(".ui-color-settings-picker > select").selectByAttribute("value", kind);
}

// Writes a control's native input the way Vue's v-model listens for it: input[type="color"] would
// pop an OS dialog, and a range input takes no typed value.
async function setNativeInput(label: string, selector: string, value: string): Promise<void> {
  await $(controlRowPath(label))
    .$(selector)
    .waitForExist({ timeoutMsg: `${label} showed no ${selector}` });
  await browser.execute(
    (rowPath: string, inputSelector: string, next: string) => {
      const row = document.evaluate(rowPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue as Element | null;
      const input = row?.querySelector<HTMLInputElement>(inputSelector);
      if (!input) return;
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    controlRowPath(label),
    selector,
    value,
  );
}

async function setCustomColor(label: string, hex: string): Promise<void> {
  await chooseColorKind(label, "custom");
  await setNativeInput(label, 'input[type="color"]', hex);
}

async function setSlider(label: string, value: number): Promise<void> {
  await setNativeInput(label, 'input[type="range"]', String(value));
}

async function forceViewWidth(width: string): Promise<void> {
  await browser.execute(
    (selector: string, forced: string) => {
      const block = [...document.querySelectorAll<HTMLElement>(`${selector} .journal-view-month-calendar`)].find(
        (candidate) => candidate.clientWidth > 0 || candidate.style.width !== "",
      );
      if (block !== undefined) block.style.width = forced;
    },
    ROOT,
    width,
  );
}

// Rounded: Obsidian's zoom scales authored pixels.
async function minHeightOf(selector: string): Promise<number | undefined> {
  const px = await browser.execute((sel: string) => {
    const cell = document.querySelector<HTMLElement>(sel);
    return cell ? Number.parseFloat(getComputedStyle(cell).minHeight) : null;
  }, selector);
  return px === null ? undefined : Math.round(px);
}

const viewMinHeight = (): Promise<number | undefined> => minHeightOf(`${ROOT} .notes-calendar-cell[role="gridcell"]`);
const previewMinHeight = (): Promise<number | undefined> => minHeightOf(".appearance-preview .appearance-preview__day");

// The frame keeps its padding at Wide, for the outline's room, so the preview fills the frame and the frame the stage.
async function previewBox(): Promise<{
  preview: number;
  frameContent: number;
  frame: number;
  stageContent: number;
  breakpoint: number;
  scrollWidth: number;
  clientWidth: number;
} | null> {
  return browser.execute(() => {
    const preview = document.querySelector<HTMLElement>(".appearance-preview");
    const frame = document.querySelector<HTMLElement>(".appearance-subpage__frame");
    const stage = document.querySelector<HTMLElement>(".appearance-subpage__stage");
    const scroller = document.querySelector<HTMLElement>(".appearance-subpage__scroller");
    if (!preview || !frame || !stage || !scroller) return null;
    const inner = (element: HTMLElement): number => {
      const style = getComputedStyle(element);
      return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    };
    return {
      preview: preview.getBoundingClientRect().width,
      frameContent: inner(frame),
      frame: frame.getBoundingClientRect().width,
      stageContent: inner(stage),
      breakpoint: 28 * Number.parseFloat(getComputedStyle(preview).fontSize),
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
    };
  });
}

const savedNames = (): Promise<string[]> =>
  browser.execute((prefix: string) => [...document.body.style].filter((name) => name.startsWith(prefix)), SAVED_PREFIX);

// The cases build on one another's editor state (the reset case undoes the earlier ones), so running a single case with --grep is not supported.
describe("the appearance editor drives the rendered calendar", () => {
  before(async () => {
    await reloadObsidianOn(PINNED_TODAY, {
      vault: "./e2e-tests/fixtures/e2e-appearance-editor",
      plugins: ["journals"],
    });
    await openView();
    // A stock fixture saves nothing, so whatever the reset case finds on the body was written here.
    expect(await savedNames()).toEqual([]);
    await openEditor();
  });

  afterEach(async () => {
    await forceViewWidth("");
  });

  after(async () => {
    await closeSettings();
    await detachView();
  });

  // Runs before any case edits a value: it reads the stock, which Obsidian defines as var(--radius-s).
  describe("a stock slider", () => {
    it("sits on the value its theme stock renders as, with the track filled up to it", async () => {
      await chooseWidth("wide");
      await chooseFromList("cell");
      const row = $(controlRowPath(m.calendar_appearance_control({ control: "box_radius" })));
      const range = row.$('input[type="range"]');
      await range.waitForExist({ timeoutMsg: "the corner radius row showed no slider" });

      const read = await browser.execute(
        (input: HTMLInputElement) => {
          const body = input.ownerDocument.body;
          return {
            value: input.value,
            fill: input.style.getPropertyValue("--slider-fill-ratio"),
            theme: getComputedStyle(body).getPropertyValue("--radius-s").trim(),
          };
        },
        (await range.getElement()) as unknown as HTMLInputElement,
      );
      expect(read).toEqual({ value: "4", fill: String(4 / 12), theme: "4px" });
      expect(await row.getText()).toContain(`4px`);
      expect(await row.getText()).toContain(m.calendar_appearance_default());
    });
  });

  describe("the preview panel", () => {
    // The cases after this one edit at Wide without choosing it.
    after(async () => {
      await chooseWidth("wide");
    });

    it("centers the preview on its stage", async () => {
      await chooseWidth("narrow");
      const gaps = await browser.execute(() => {
        const stage = document.querySelector(".appearance-subpage__stage")?.getBoundingClientRect();
        const preview = document.querySelector(".appearance-preview")?.getBoundingClientRect();
        if (stage === undefined || preview === undefined) return null;
        return { left: preview.left - stage.left, right: stage.right - preview.right };
      });
      expect(gaps).not.toBeNull();
      expect(Math.abs((gaps?.left ?? 0) - (gaps?.right ?? 0))).toBeLessThan(2);
      expect(gaps?.left).toBeGreaterThan(0);
    });
  });

  describe("a color", () => {
    it("a color set in the editor paints the calendar view", async () => {
      await pickInPreview(".appearance-preview__day[data-today]", "today");
      await setCustomColor(TEXT_COLOR, TODAY_TEXT);
      await expectRead(
        () => labelHexOf(`${daySelector(PINNED_TODAY)}[data-today]`),
        TODAY_TEXT,
        `the view's today did not take the editor's ${TODAY_TEXT}`,
      );
    });
  });

  describe("a narrow override", () => {
    it("a narrow override applies only below the breakpoint", async () => {
      await chooseWidth("wide");
      await chooseFromList("cell");
      await setSlider(ROW_HEIGHT, WIDE_HEIGHT);
      await chooseWidth("narrow");
      await setSlider(ROW_HEIGHT, NARROW_HEIGHT);

      await forceViewWidth(NARROW_WIDTH);
      await expectRead(viewMinHeight, NARROW_HEIGHT, `the view at ${NARROW_WIDTH} did not use the narrow row height`);
      await forceViewWidth(WIDE_WIDTH);
      await expectRead(viewMinHeight, WIDE_HEIGHT, `the view at ${WIDE_WIDTH} did not keep the wide row height`);
    });

    // The preview's own widths must fall on either side of the calendar's 28em container query.
    it("the preview switches widths with the editor", async () => {
      await chooseWidth("narrow");
      await expectRead(previewMinHeight, NARROW_HEIGHT, "the narrow preview did not use the narrow row height");
      const narrow = await previewBox();
      expect(narrow?.preview).toBe(260);
      await chooseWidth("wide");
      await expectRead(previewMinHeight, WIDE_HEIGHT, "the wide preview did not use the wide row height");
    });

    it("the wide preview fills its stage without scrolling it", async () => {
      await chooseWidth("wide");
      const box = await previewBox();
      expect(box).not.toBeNull();
      if (box === null) return;
      expect(Math.abs(box.preview - box.frameContent)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.frame - box.stageContent)).toBeLessThanOrEqual(1);
      expect(box.preview).toBeGreaterThan(box.breakpoint);
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
    });
  });

  describe("Unchanged", () => {
    const outsideToday = `${daySelector(PINNED_TODAY)}[data-today][data-outside]`;

    before(async () => {
      await pageViewForward();
      await $(outsideToday).waitForExist({ timeoutMsg: `April 2027 did not show ${PINNED_TODAY} as an outside today` });
    });

    it("Unchanged passes through", async () => {
      await chooseWidth("wide");
      await chooseFromList("outside");
      await setCustomColor(TEXT_COLOR, OUTSIDE_TEXT);
      await expectRead(
        () => labelHexOf(`${daySelector(OUTSIDE_PLAIN)}[data-outside]`),
        OUTSIDE_TEXT,
        `an outside day did not take the editor's ${OUTSIDE_TEXT}`,
      );
      await expectRead(
        () => labelHexOf(outsideToday),
        TODAY_TEXT,
        `the outside today did not keep today's ${TODAY_TEXT} over the outside text`,
      );

      await chooseFromList("today");
      await chooseColorKind(TEXT_COLOR, "unchanged");
      await expectRead(
        () => labelHexOf(outsideToday),
        OUTSIDE_TEXT,
        `an Unchanged today did not pass to the outside ${OUTSIDE_TEXT}`,
      );
    });
  });

  describe("reset", () => {
    it("reset restores the stock look", async () => {
      expect(await savedNames()).not.toEqual([]);
      const edited: readonly (readonly [Width, PartKey])[] = [
        ["wide", "today"],
        ["wide", "outside"],
        ["wide", "cell"],
        ["narrow", "cell"],
      ];
      for (const [width, part] of edited) {
        await chooseWidth(width);
        await chooseFromList(part);
        const reset = $(`button=${m.calendar_appearance_reset({ width })}`);
        await reset.waitForEnabled({ timeoutMsg: `${part} at ${width} did not read as modified` });
        await reset.click();
        await reset.waitForEnabled({ reverse: true, timeoutMsg: `${part} at ${width} stayed modified after reset` });
      }
      await expectRead(
        async () => {
          const names = await savedNames();
          return names.join(", ");
        },
        "",
        "the writer left saved variables on the body after every part was reset",
      );
    });
  });
});
