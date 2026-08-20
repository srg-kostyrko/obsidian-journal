import { $, browser } from "@wdio/globals";

import { FixtureFileMissingError } from "../support/errors.js";
import { seedNote } from "../support/vault.js";

import { calendarSurface, type CalendarSurface } from "./calendar.js";

// Obsidian wraps each registered code block in `.block-language-<key>` in reading mode;
// the plugin host adds its own cssClass inside. Every selector is scoped to a block so
// the view-leaf markup (a bare `.notes-month-view`) never collides.

// Each renderBlock opens its note in a fresh tab; Obsidian keeps inactive tab leaves in
// the DOM (hidden via inline display:none), so an unscoped `.block-language-*` would match
// a stale prior note. Pin every block root to the visible leaf (the just-opened note),
// matching view.ts's MONTH_VIEW.
const VISIBLE_LEAF = '.workspace-leaf:not([style*="display: none"])';

export const NAV_BLOCK = `${VISIBLE_LEAF} .block-language-calendar-nav`;
export const TIMELINE_BLOCK = `${VISIBLE_LEAF} .block-language-calendar-timeline`;
export const HOME_BLOCK = `${VISIBLE_LEAF} .block-language-journals-home`;
export const CODE_BLOCK_ERROR = ".code-block-error";

// The connected nav view, the unconnected fallback, the prev/next buttons.
export const NAV_VIEW = `${NAV_BLOCK} .nav-view`;
export const NAV_NOT_CONNECTED = `${NAV_BLOCK} .journal-nav-not-connected`;
export const NAV_NEXT = `${NAV_BLOCK} .nav-next`;
// The current period's block is the *direct* child of .nav-view; prev/next blocks live
// inside .nav-block-relative, so the `>` combinator keeps their unstyled decorations out.
export const NAV_CURRENT = `${NAV_BLOCK} .nav-view > .nav-block`;
// Per-slot CSS styling hooks (#170): each block carries a modifier class so a snippet can
// target previous/current/next independently.
export const NAV_PREVIOUS_BLOCK = `${NAV_BLOCK} .nav-block-previous`;
export const NAV_CURRENT_BLOCK = `${NAV_BLOCK} .nav-block-current`;
export const NAV_NEXT_BLOCK = `${NAV_BLOCK} .nav-block-next`;

// calendar-timeline (mode:month) embeds the same NotesMonthView/NotesCalendarCell grid
// as the view leaf, so chunk 1's factory binds to it unchanged.
export const timelineCalendar: CalendarSurface = calendarSurface(TIMELINE_BLOCK);

// Fenced bodies. The timeline runs over all journals (unconnected host ⇒ null shelf) and
// must show the week column for the has-open-task weekly decoration.
export const NAV_FENCE = "```calendar-nav\n```";
export const TIMELINE_FENCE = "```calendar-timeline\nmode: month\nweeks: left\n```";
// Quarter mode stacks three month grids; adjacent-month days are blanked so a neighbor
// month's own cells aren't shadowed by duplicated dates.
export const TIMELINE_QUARTER_FENCE = "```calendar-timeline\nmode: quarter\nweeks: left\n```";
// Hide Sunday (0) and Saturday (6): the month grid should drop those two weekday columns.
export const TIMELINE_HIDDEN_WEEKDAYS_FENCE =
  "```calendar-timeline\nmode: month\nweeks: left\nhiddenWeekdays: [0, 6]\n```";
export const TIMELINE_BAD_FENCE = "```calendar-timeline\nmode: bogus\n```";
export const HOME_FENCE = "```journals-home\n```";

// A note connected to `journal` at `anchor` (frontmatter is what the index reads), with a
// body that embeds a fence and optional inline content (tags/tasks for nav decorations).
export function hostNote(journal: string, anchor: string, body: string): string {
  return `---\njournal: ${journal}\njournal-date: ${anchor}\n---\n${body}\n`;
}

// An unconnected note carrying only a fence (timeline/home need no journal connection).
export function plainNote(fence: string): string {
  return `${fence}\n`;
}

// openFile carries the mode in its view state so the block renders on open. This
// wdio-obsidian-service build exposes no executeObsidianCommand, so there is no toggle
// command to call — the state on openFile is the mechanism. A fresh leaf avoids
// clobbering the calendar view leaf a prior seed step may have opened.
export async function openInReadingMode(path: string): Promise<void> {
  const found = await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return false;
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: "preview" } });
    return true;
  }, path);
  if (!found) throw new FixtureFileMissingError(path);
}

// Seed a note, open it in reading mode, and wait for `blockRoot` to render. The wait is
// the render assertion; callers separately assert the absence of `.code-block-error`.
export async function renderBlock(path: string, content: string, blockRoot: string): Promise<void> {
  await seedNote(path, content);
  await openInReadingMode(path);
  await $(blockRoot).waitForExist({ timeoutMsg: `code block did not render: ${blockRoot} (${path})` });
}

// A real `$(NAV_NEXT).click()` fails for the nav-next icon button: WebDriver's pointer
// click can't reach it in the reading-mode nav layout (the Electron harness lacks the
// window/rect command scrollIntoView relies on). Every other e2e click uses a real
// WebDriver click — this button is the lone exception. A native DOM click still fires the
// Vue @click handler, so OpenDateFlow is genuinely driven; only the pointer hit-test is
// bypassed.
export async function clickNavNext(): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector<HTMLElement>(sel)?.click();
  }, NAV_NEXT);
}

export interface NavLayout {
  // px the content overflows its box horizontally; 0 means nothing is clipped.
  overflowX: number;
  // distinct row offsets the prev/current/next blocks occupy; > 1 means they wrapped.
  rows: number;
}

// The mobile overflow guard (#216) can't resize the window — this wdio-obsidian build
// rejects setWindowSize, and app.emulateMobile() reloads the app and detaches the
// executeObsidian bridge. Reading mode also auto-sizes .nav-view to its content, so it
// never overflows at desktop width. Forcing the block root to a phone-pane width is the
// only way to drive the production flex reflow: with flex-wrap the blocks stack and stay
// clip-free; without it they'd hold one row.
export async function narrowNavLayout(widthPx: number): Promise<NavLayout> {
  // Every test here opens its host in a new leaf, so earlier leaves keep their own .nav-view in
  // the DOM at zero width, and the leaf just opened can have its .nav-view mounted before the
  // leaf has any layout. Measuring a zero-sized view is not an error that surfaces: every
  // getBoundingClientRect() in it reads 0, so all three blocks share top 0 and the reader reports
  // `rows: 1, overflowX: 0` — "the blocks did not wrap", indistinguishable from a real
  // regression. Wait for a laid-out view rather than measuring whichever one is at hand.
  await browser.waitUntil(
    async () =>
      browser.execute(
        (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].some((v) => v.clientWidth > 0),
        NAV_VIEW,
      ),
    { timeoutMsg: `no laid-out ${NAV_VIEW} to narrow to ${widthPx}px` },
  );
  return browser.execute(
    (sel: string, width: number) => {
      const view = [...document.querySelectorAll<HTMLElement>(sel)].find((v) => v.clientWidth > 0);
      if (!view) return { overflowX: -1, rows: 0 };
      const block = view.closest<HTMLElement>(".block-language-calendar-nav");
      if (block) block.style.width = `${width}px`;
      void view.offsetHeight;
      const tops = [...view.children].map((child) => Math.round(child.getBoundingClientRect().top));
      return { overflowX: view.scrollWidth - view.clientWidth, rows: new Set(tops).size };
    },
    NAV_VIEW,
    widthPx,
  );
}

// Live Preview, the other mode a code block mounts in: `source` with `source: false` is the
// editor-with-widgets rendering, vs `source: true` for raw text. Live Preview un-renders the
// block holding the cursor, and a freshly opened note puts the cursor on the first body line
// — which for these fixtures is the fence itself, so the block would come up as source text
// and never mount. Parking the cursor on the last line is what makes it render, so the note
// must carry a line *after* the fence: livePreviewNote() appends one.
export async function openInLivePreview(path: string): Promise<void> {
  const found = await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return false;
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: "source", source: false } });
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    view?.editor.setCursor({ line: view.editor.lastLine(), ch: 0 });
    return true;
  }, path);
  if (!found) throw new FixtureFileMissingError(path);
}

// The trailing line openInLivePreview parks the cursor on. Named so a spec reads as
// "this note is for live preview" rather than carrying an unexplained paragraph.
export const LIVE_PREVIEW_TAIL = "tail paragraph";

export function livePreviewNote(journal: string, anchor: string, fence: string): string {
  return hostNote(journal, anchor, `${fence}\n\n${LIVE_PREVIEW_TAIL}`);
}

// The timeline's previous/next row. Buttons carry data-nav rather than a class so the
// selector does not ride on styling hooks a theme may want to rename.
export const TIMELINE_NAV = `${TIMELINE_BLOCK} .timeline-navigation`;
export const TIMELINE_NAV_PREV = `${TIMELINE_NAV} [data-nav="prev"]`;
export const TIMELINE_NAV_NEXT = `${TIMELINE_NAV} [data-nav="next"]`;
export const TIMELINE_NAV_RESET = `${TIMELINE_NAV} [data-nav="reset"]`;
export const TIMELINE_NAV_LABEL = `${TIMELINE_NAV} .timeline-navigation__label`;

export const TIMELINE_NAV_FENCE = "```calendar-timeline\nmode: week\nweeks: left\nnavigation: true\n```";

// Same hit-test limitation clickNavNext documents: a real WebDriver click cannot reach a
// control inside a rendered code block, so dispatch a native DOM click. The Vue handler
// runs either way; only the pointer path is bypassed.
export async function clickTimelineNav(selector: string): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector<HTMLElement>(sel)?.click();
  }, selector);
}

// The week-number cells of every grid the block currently shows, in order.
export function timelineWeekAnchors(): Promise<string[]> {
  return browser.execute((sel: string) => {
    return [...document.querySelectorAll<HTMLElement>(sel)].map((cell) => cell.dataset.anchor ?? "");
  }, `${TIMELINE_BLOCK} [data-testid="week-number-cell"]`);
}

// Obsidian overlays its own edit-block affordance on the top-right corner of a rendered code
// block, which is where a full-width navigation row would put its next control. Reports the
// two rects so a spec can assert they stay apart.
export function timelineNavEditButtonOverlap(): Promise<{ measured: boolean; overlaps: boolean }> {
  return browser.execute(() => {
    const leaf = [...document.querySelectorAll<HTMLElement>(".workspace-leaf")]
      .filter((l) => !l.style.display.includes("none"))
      .find((l) => l.querySelector(".timeline-navigation"));
    const next = leaf?.querySelector<HTMLElement>('.timeline-navigation [data-nav="next"]');
    const block = next?.closest<HTMLElement>(".block-language-calendar-timeline");
    const edit = block?.parentElement?.querySelector<HTMLElement>(".edit-block-button");
    if (!next || !edit) return { measured: false, overlaps: false };
    const a = next.getBoundingClientRect();
    const b = edit.getBoundingClientRect();
    return {
      measured: true,
      overlaps: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
    };
  });
}

// Pixels the navigation label's centre sits away from the row's own centre. Positive is right.
export function timelineNavLabelOffset(): Promise<number | null> {
  return browser.execute(() => {
    const leaf = [...document.querySelectorAll<HTMLElement>(".workspace-leaf")]
      .filter((l) => !l.style.display.includes("none"))
      .find((l) => l.querySelector(".timeline-navigation"));
    const nav = leaf?.querySelector<HTMLElement>(".timeline-navigation");
    const label = nav?.querySelector<HTMLElement>(".timeline-navigation__label");
    if (!nav || !label) return null;
    const row = nav.getBoundingClientRect();
    const text = label.getBoundingClientRect();
    return Math.round((text.left + text.right) / 2 - (row.left + row.right) / 2);
  });
}
