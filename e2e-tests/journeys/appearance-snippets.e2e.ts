import { $, browser, expect } from "@wdio/globals";

import { m } from "../../src/i18n/paraglide/messages.js";
import { readRawSettings, writeRawSettings } from "../support/plugin-data.js";
import { triggerExternalSettingsChange } from "../support/plugin.js";
import { clickIcon, closeSettings, expandSection, openSettings } from "../support/settings.js";
import { closePopoutWindows } from "../support/vault.js";
import { waitForState } from "../support/wait.js";

import { openInReadingMode } from "./code-blocks.js";
import { openCalendarInPopout } from "./view.js";

// The saved appearance values are CSS variables on each window's root, so a user's CSS snippet on
// `body` or closer must win without !important. The fixture enables
// .obsidian/snippets/journal-appearance.css and one-view.css through Obsidian's own loader; the
// manual's one-view example is one-view.css verbatim.

const DEFAULT_VIEW = "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c";
const SNIPPET_TARGET_VIEW = "5a7e9c11-2b3d-4e5f-8a6b-7c8d9e0f1a2b";

const SAVED_GREEN = "#00ff00";
const SNIPPET_BLUE = "#0000ff";
const LIVE_MAGENTA = "#ff00ff";

const TODAY_CELL = ".notes-calendar-cell[data-today]";
const SELECTED_CELL = ".notes-calendar-cell[data-selected]";
// The cell's text span owns its color chain; the cell root holds only the part's own color.
const TODAY_TEXT = `${TODAY_CELL} > .notes-calendar-cell__text`;

function viewCell(viewId: string, cell: string): string {
  return `[data-journal-view="${viewId}"] ${cell}`;
}

async function openView(viewId: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, id) => {
    const leaf = app.workspace.getRightLeaf(false);
    await leaf?.setViewState({ type: `journal-view:${id}`, active: true });
  }, viewId);
  await $(viewCell(viewId, TODAY_CELL)).waitForExist({ timeoutMsg: `view ${viewId} did not render a today cell` });
}

async function detachJournalViews(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    for (const leaf of app.workspace.getLeavesOfType("journal-view:b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c"))
      leaf.detach();
    for (const leaf of app.workspace.getLeavesOfType("journal-view:5a7e9c11-2b3d-4e5f-8a6b-7c8d9e0f1a2b"))
      leaf.detach();
  });
}

async function colorHex(selector: string): Promise<string | undefined> {
  const prop = await $(selector).getCSSProperty("color");
  return (prop.parsed as { hex?: string }).hex;
}

// WebDriver strips the spaces from a shorthand value, so the ring color is read from its parse.
async function ringHex(selector: string): Promise<string | undefined> {
  const prop = await $(selector).getCSSProperty("box-shadow");
  return (prop.parsed as { hex?: string }).hex;
}

function rgbToHex(rgb: string): string | undefined {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!match) return undefined;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

async function popoutTodayColor(): Promise<string> {
  return (
    (await browser.executeObsidian(({ app }) => {
      const workspace = app.workspace as typeof app.workspace & {
        iterateAllLeaves(callback: (leaf: { view: { containerEl: HTMLElement } }) => void): void;
      };
      const mainWindow = workspace.containerEl.ownerDocument.defaultView;
      let color: string | undefined;
      workspace.iterateAllLeaves((leaf) => {
        const win = leaf.view.containerEl.ownerDocument.defaultView;
        if (!win || win === mainWindow) return;
        const cell = leaf.view.containerEl.querySelector<HTMLElement>(
          ".notes-calendar-cell[data-today] > .notes-calendar-cell__text",
        );
        if (cell) color = win.getComputedStyle(cell).color;
      });
      return color ?? "";
    })) ?? ""
  );
}

describe("appearance variables and CSS snippets", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-appearance-snippets", plugins: ["journals"] });
  });

  after(async () => {
    await closePopoutWindows();
    await detachJournalViews();
  });

  it("a snippet overrides a saved appearance value without !important", async () => {
    await openView(DEFAULT_VIEW);
    const selected = viewCell(DEFAULT_VIEW, SELECTED_CELL);
    await $(selected).waitForExist({ timeoutMsg: "the default view has no selected cell" });
    // The ring is drawn by the cell's selected layer, not the cell itself.
    const ring = `${selected} [data-layer="selected-ring"]`;
    await waitForState(
      () => ringHex(ring),
      (hex) => hex === "#ff0000",
      "the selected cell ring did not take the snippet #ff0000 over the saved #00ff00",
    );
  });

  it("a view-scoped snippet changes only that view", async () => {
    await openView(DEFAULT_VIEW);
    await openView(SNIPPET_TARGET_VIEW);
    await waitForState(
      () => colorHex(viewCell(SNIPPET_TARGET_VIEW, TODAY_TEXT)),
      (hex) => hex === SNIPPET_BLUE,
      "the snippet-target view's today cell did not turn #0000ff",
    );
    expect(await colorHex(viewCell(DEFAULT_VIEW, TODAY_TEXT))).toBe(SAVED_GREEN);
  });

  it("a view-scoped snippet does not reach a calendar in a note", async () => {
    await openInReadingMode("calendar-note.md");
    const todayInNote = `.markdown-reading-view .block-language-calendar-timeline ${TODAY_TEXT}`;
    await $(todayInNote).waitForExist({ timeoutMsg: "the calendar block in the note did not render" });
    expect(await colorHex(todayInNote)).toBe(SAVED_GREEN);
  });

  describe("in a popout", () => {
    before(async () => {
      await detachJournalViews();
      await openView(DEFAULT_VIEW);
      await openCalendarInPopout();
    });

    after(closePopoutWindows);

    it("a popout opened after load gets the saved values", async () => {
      await waitForState(
        popoutTodayColor,
        (rgb) => typeof rgb === "string" && rgbToHex(rgb) === SAVED_GREEN,
        "the popout's today cell did not take the saved #00ff00",
      );
    });

    it("a saved color changed while the popout is open reaches it", async () => {
      const settings = JSON.parse((await readRawSettings()) ?? "{}") as {
        appearance: { wide: { today: { text: { color: unknown } } } };
      };
      settings.appearance.wide.today.text.color = { type: "custom", color: LIVE_MAGENTA };
      await writeRawSettings(JSON.stringify(settings));
      await triggerExternalSettingsChange();
      await waitForState(
        popoutTodayColor,
        (rgb) => rgbToHex(rgb) === LIVE_MAGENTA,
        "the open popout's today cell did not turn the changed #ff00ff",
      );
    });
  });

  // The rule a view's settings page copies must select that view's root and no other, or a snippet
  // written from it styles nothing, or every view.
  describe("the rule copied from a view's settings", () => {
    type CopyWindow = Window & { __copiedText?: string };

    // Stubbed in the page: both workers share one OS clipboard, so the real one would race.
    before(async () => {
      await browser.execute(() => {
        const win = window as CopyWindow;
        // An own property shadows Clipboard.prototype.writeText; deleting it restores the real one.
        Object.defineProperty(navigator.clipboard, "writeText", {
          configurable: true,
          value: (text: string) => {
            win.__copiedText = text;
            return Promise.resolve();
          },
        });
      });
    });

    after(async () => {
      await browser.execute(() => {
        Reflect.deleteProperty(navigator.clipboard, "writeText");
        delete (window as CopyWindow).__copiedText;
      });
      await closeSettings();
      await detachJournalViews();
    });

    it("selects that view and no other", async () => {
      await openView(DEFAULT_VIEW);
      await openView(SNIPPET_TARGET_VIEW);

      await openSettings();
      await expandSection(m.view_dashboard_section_title());
      await clickIcon(m.view_dashboard_open({ name: "Snippet target" }));
      await expandSection(m.view_edit_css_title());
      await $(".copyable-code").click();

      const copied = (): Promise<string | null> => browser.execute(() => (window as CopyWindow).__copiedText ?? null);
      await waitForState(copied, (text) => text.length > 0, "clicking the rule copied nothing");
      const rule = (await copied()) ?? "";
      expect(rule.endsWith(" {\n}")).toBe(true);

      const matched = await browser.execute(
        (selector) => [...document.querySelectorAll(selector)].map((el) => (el as HTMLElement).dataset.journalView),
        rule.slice(0, rule.indexOf(" {")),
      );
      expect(matched).toEqual([SNIPPET_TARGET_VIEW]);
    });
  });
});
