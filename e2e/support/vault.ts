import { browser } from "@wdio/globals";

import { FixtureFileMissingError, RenameFileFailedError, RenameRequiresLinkUpdateError } from "./errors.js";
import { confirmUpdateLinksDialog, isUpdateLinksDialogOpen } from "./rename-links-dialog.js";
import { waitForState } from "./wait.js";

export type Frontmatter = Record<string, unknown>;

// A foreign create — not the plugin's own NoteCreationService — so the
// self-write guard does not suppress it and auto-attach genuinely fires.
export async function createNote(path: string, content = ""): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, notePath, body) => {
      // Marked inside the same round trip rather than through a call of its own: an extra
      // WebDriver hop before the mutation would move the very boot-window timing a failure
      // here is usually about. The console is where the plugin's own debug trail lands, so
      // the two interleave and a dump reads as one ordered story (see wdio.conf.mts).
      console.debug("[e2e]", "create", notePath);
      await app.vault.create(notePath, body);
    },
    path,
    content,
  );
}

// Overwrites a note's whole content in place — a foreign edit (vault.modify, not the
// plugin's own writers) so metadataCache re-reads the note and the live "metadata-changed"
// event fires, exactly as a user typing into the note would drive it.
export async function writeNote(path: string, content: string): Promise<void> {
  const written = await browser.executeObsidian(
    async ({ app, obsidian }, notePath, body) => {
      console.debug("[e2e]", "write", notePath);
      const file = app.vault.getAbstractFileByPath(notePath);
      if (!(file instanceof obsidian.TFile)) return false;
      await app.vault.modify(file, body);
      return true;
    },
    path,
    content,
  );
  if (!written) throw new FixtureFileMissingError(path);
}

// A window-scoped sentinel, not a return value, because the fire-and-forget renameFile call that
// records against it (triggerRename below) has already returned to Node by the time it could
// reject. `window.__journalsRenameFailure` is one extra global for one narrow purpose: without
// it, a renderer-side rejection (e.g. a destination path that already exists) becomes an
// unhandled promise rejection nobody reads, and the poll that follows keeps waiting for a file
// that will never appear — reading, from Node, as indistinguishable from "the dialog just never
// opened" until the full timeout budget is spent.
interface RenameWindow extends Window {
  __journalsRenameFailure?: string;
}

// Fires app.fileManager.renameFile without awaiting its own promise, and returns only whether
// the source file existed to be renamed at all. That promise does not settle until Obsidian's
// native "Update links?" dialog is answered, whenever the renamed file has at least one inbound
// link and the vault's alwaysUpdateLinks is off (the default) — and nothing can answer that
// dialog while this very executeObsidian round trip is the thing blocking on it. Awaiting it
// here would deadlock: chromedriver's own script-execution timeout (30s) eventually gives up on
// the still-pending call, and webdriverio silently retries the identical script (a timeout is
// one of its retryable conditions), re-running this callback a second time against a file the
// first, actually-successful attempt already renamed — surfacing downstream as a confusing "no
// fixture file" error, not a real gap in whatever the test was exercising. Firing the rename and
// returning immediately, then polling for its outcome from Node (waitForRenameOutcome below),
// keeps this round trip itself always under the timeout, dialog or no dialog.
async function triggerRename(from: string, to: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app, obsidian }, fromPath, toPath) => {
      console.debug("[e2e]", "rename", `${fromPath} -> ${toPath}`);
      const file = app.vault.getAbstractFileByPath(fromPath);
      if (!(file instanceof obsidian.TFile)) return false;
      const win = window as RenameWindow;
      delete win.__journalsRenameFailure;
      app.fileManager.renameFile(file, toPath).catch((error: unknown) => {
        win.__journalsRenameFailure = error instanceof Error ? error.message : String(error);
      });
      return true;
    },
    from,
    to,
  );
}

// The WebDriver wire serializes `undefined` to `null` (see waitForState above), so "no failure
// recorded" arrives here as `null`, not the `undefined` the sentinel is declared to hold when
// unset. Callers must treat both as "nothing to report", the same rule waitForState enforces for
// every other executeObsidian read.
function renameFailure(): Promise<string | null | undefined> {
  return browser.executeObsidian(() => (window as RenameWindow).__journalsRenameFailure);
}

// Distinguishes the three outcomes a fire-and-forget rename (triggerRename) can reach, none of
// which are visible from the boolean triggerRename returned: the rename landed, Obsidian opened
// the native Update links? dialog and is waiting on an answer, or the renameFile promise
// rejected in the renderer (recorded by triggerRename's .catch, since nothing else would ever
// read that rejection). All three are polled together rather than waiting out noteExists(to)
// first and checking the others only on a timeout: whichever happens must be reported within one
// poll interval, not after paying the full wait budget.
async function waitForRenameOutcome(to: string): Promise<{ dialogOpened: boolean; failure?: string }> {
  let dialogOpened = false;
  let failure: string | undefined;
  await waitForState(
    async () => {
      const rejected = await renameFailure();
      if (rejected !== undefined && rejected !== null) {
        failure = rejected;
        return true;
      }
      if (await isUpdateLinksDialogOpen()) {
        dialogOpened = true;
        return true;
      }
      return noteExists(to);
    },
    (settled) => settled,
    `waited for ${to} to exist after rename`,
  );
  return { dialogOpened, failure };
}

// Renames a note with no inbound link. If the rename instead opens Obsidian's native "Update
// links?" dialog — meaning the note DOES have an inbound link — this fails fast with a named
// error rather than answering the dialog itself or waiting out a timeout: this helper doesn't
// know which button the caller would want pressed, and guessing "Update" silently would hide a
// fixture that grew a link it didn't have when the test was written. Use
// renameNoteAcceptingLinkUpdates for a rename that is expected to raise the dialog.
export async function renameNote(from: string, to: string): Promise<void> {
  const started = await triggerRename(from, to);
  if (!started) throw new FixtureFileMissingError(from);
  const { dialogOpened, failure } = await waitForRenameOutcome(to);
  if (failure !== undefined) throw new RenameFileFailedError(from, to, failure);
  if (dialogOpened) throw new RenameRequiresLinkUpdateError(from, to);
}

// Renames a note that is expected to have at least one inbound link, so Obsidian's native
// "Update links?" dialog is expected to open. Shares triggerRename's fire-and-forget trigger
// with renameNote — the same deadlock, and the same renderer-rejection blind spot, apply here,
// dialog or not — but then drives the dialog to a close instead of treating its appearance as a
// caller error. Deliberately does not click "Always update": that flips alwaysUpdateLinks for
// the whole vault, permanently skipping the dialog from then on, which would make this helper
// stop exercising the path it exists to cover.
export async function renameNoteAcceptingLinkUpdates(from: string, to: string): Promise<void> {
  const started = await triggerRename(from, to);
  if (!started) throw new FixtureFileMissingError(from);
  await confirmUpdateLinksDialog();
  const { failure } = await waitForRenameOutcome(to);
  if (failure !== undefined) throw new RenameFileFailedError(from, to, failure);
}

// Reads what Obsidian has parsed (post-metadataCache), not raw bytes — the bytes
// can run ahead of Obsidian's view, which is exactly the timing the seam tests.
export function frontmatterOf(path: string): Promise<Frontmatter | undefined> {
  return browser.executeObsidian(({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.metadataCache.getFileCache(file)?.frontmatter;
  }, path);
}

// The resolved-links map Obsidian's own metadataCache maintains for a note: destination path to
// reference count. This is what "the link still works after a rename" means in practice — a link
// whose *text* survived a rewrite but whose *target* did not resolve would read as broken to the
// user despite any raw-content assertion passing.
export function resolvedLinksFrom(path: string): Promise<Record<string, number> | undefined> {
  return browser.executeObsidian(({ app }, notePath) => app.metadataCache.resolvedLinks[notePath], path);
}

// Reads what Obsidian has parsed, not raw bytes — consistent with frontmatterOf.
export async function contentOf(path: string): Promise<string | undefined> {
  return browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.vault.cachedRead(file);
  }, path);
}

// Resolves against the vault's live file map (updated synchronously by create/rename/trash), not
// metadataCache — so a test can wait for a note to appear or, after a delete, to be gone.
export function noteExists(path: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app, obsidian }, notePath) => app.vault.getAbstractFileByPath(notePath) instanceof obsidian.TFile,
    path,
  );
}

export function activeNotePath(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path);
}

// Open in "active" mode reuses the current leaf; "tab" mode adds one. Counting markdown leaves
// before and after is how a test tells those two open modes apart.
export function markdownLeafCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => app.workspace.getLeavesOfType("markdown").length);
}

// A "split" open creates a pane beside the active one, so the main root split gains a child; a
// "tab" open reuses the existing tab group and leaves this count unchanged. A leaf count alone
// cannot tell split from tab — both add a leaf — so this is the signal that distinguishes them.
// Reaching workspace.rootSplit.children mirrors uri.ts's protocolHandlers cast: internal runtime
// shape, deliberately so, since the regression we guard against is Obsidian changing that routing.
export function rootSplitChildCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => {
    const workspace = app.workspace as unknown as { rootSplit: { children: readonly unknown[] } };
    return workspace.rootSplit.children.length;
  });
}

// A "window" open hosts the note in a popout window, which Obsidian tracks under
// workspace.floatingSplit. Counting those windows confirms the popout opened rather than the note
// falling back into the main window — the exact fallback an Obsidian API change once introduced.
export function popoutWindowCount(): Promise<number> {
  return browser.executeObsidian(({ app }) => {
    const workspace = app.workspace as unknown as { floatingSplit?: { children: readonly unknown[] } };
    return workspace.floatingSplit?.children.length ?? 0;
  });
}

// Whether a markdown leaf in the main window holds this note. Opening a note that is already open
// reuses whichever leaf has it, so the active *file* is the target either way — a leaf in the main
// window holding it is what separates "opened in my window" from "focus jumped to the popout".
export function mainWindowHoldsNote(path: string): Promise<boolean> {
  return browser.executeObsidian(
    ({ app }, notePath) =>
      app.workspace.getLeavesOfType("markdown").some((leaf) => {
        const view = leaf.view as { file?: { path: string } | null };
        return leaf.getRoot() === app.workspace.rootSplit && view.file?.path === notePath;
      }),
    path,
  );
}

// Puts the user back in the main window after a popout opened — the state a report of "it takes me
// to a different window" starts from, since opening in a popout leaves that popout focused. Focus
// has to reach the window itself: the plugin reads Obsidian's `activeWindow`, which only moves on a
// real window focus, not on a leaf becoming active.
export async function focusMainWindow(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    app.workspace.containerEl.win.focus();
    const inMain = app.workspace.getLeavesOfType("markdown").find((leaf) => leaf.getRoot() === app.workspace.rootSplit);
    if (inMain) app.workspace.setActiveLeaf(inMain, { focus: true });
  });
  await browser.waitUntil(
    async () =>
      browser.executeObsidian(
        ({ app }) => app.workspace.containerEl.win.activeWindow === app.workspace.containerEl.win,
      ),
    { timeoutMsg: "main window never regained focus after the popout opened" },
  );
}

// Detaches every leaf rooted outside the main window, which closes its popout. A test that opens a
// popout must call this before finishing: an open popout stays the active window, so the next
// test's modals render in the popout's document where the main-window selectors can't reach them.
export async function closePopoutWindows(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    const workspace = app.workspace as unknown as {
      rootSplit: unknown;
      iterateAllLeaves(callback: (leaf: { getRoot(): unknown; detach(): void }) => void): void;
    };
    const popoutLeaves: { detach(): void }[] = [];
    workspace.iterateAllLeaves((leaf) => {
      if (leaf.getRoot() !== workspace.rootSplit) popoutLeaves.push(leaf);
    });
    for (const leaf of popoutLeaves) leaf.detach();
  });
}

export function waitForFrontmatter(
  path: string,
  predicate: (frontmatter: Frontmatter) => boolean,
  timeoutMsg: string,
  timeout?: number,
): Promise<void> {
  return waitForState(() => frontmatterOf(path), predicate, timeoutMsg, timeout);
}

export function waitForJournalFrontmatter(
  path: string,
  expected: { journal: string; date: string },
  timeout?: number,
): Promise<void> {
  return waitForFrontmatter(
    path,
    (frontmatter) => frontmatter.journal === expected.journal && frontmatter["journal-date"] === expected.date,
    `waited for ${path} to attach journal frontmatter (journal=${expected.journal}, journal-date=${expected.date})`,
    timeout,
  );
}

// A command opens today's note under the journal's folder. The date is "today" at
// run time, so we never predict the path — we wait for the active file to land
// under the expected folder, robust against any stale active file from boot.
export async function waitForActiveNoteIn(folder: string): Promise<string> {
  let path = "";
  await waitForState(
    activeNotePath,
    (active) => {
      path = active;
      return active.startsWith(`${folder}/`);
    },
    `waited for a journal note to open under ${folder}/`,
  );
  return path;
}

export function waitForContent(
  path: string,
  predicate: (content: string) => boolean,
  timeoutMsg: string,
): Promise<void> {
  return waitForState(() => contentOf(path), predicate, timeoutMsg);
}

// Folder-aware create-or-overwrite: the fixture carries no note folders and vault.create does
// not create missing parents. Idempotent so a seed can't collide with a note the run already
// produced (e.g. today's note when today's day-of-month matches a seeded dayAnchor).
export async function seedNote(path: string, content: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app, obsidian }, notePath, body) => {
      console.debug("[e2e]", "seed", notePath);
      const existing = app.vault.getAbstractFileByPath(notePath);
      if (existing instanceof obsidian.TFile) {
        await app.vault.modify(existing, body);
        return;
      }
      const slash = notePath.lastIndexOf("/");
      if (slash > 0) {
        const dir = notePath.slice(0, slash);
        if (!(await app.vault.adapter.exists(dir))) await app.vault.createFolder(dir);
      }
      await app.vault.create(notePath, body);
    },
    path,
    content,
  );
}

// Opens a note in a markdown editor leaf — the active-editor / active-file precondition for
// the per-note command guards (insert-date-link, connect-note, open-next/prev).
export async function openNote(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (file instanceof obsidian.TFile) await app.workspace.getLeaf(false).openFile(file);
  }, path);
}

// Detaches every markdown editor leaf, leaving no active editor and no active file — the
// negative precondition for the editor / active-note command guards.
export async function closeAllLeaves(): Promise<void> {
  await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType("markdown"));
}

// A second open into the same folder can read back the still-active PREVIOUS note if the
// active-file switch hasn't landed yet — the plugin awaits its own metadataCache round trip
// before opening the note. Wait for the active path to differ from `previous` (which may be
// null, a WebDriver-serialized undefined, meaning "nothing was active yet"), optionally also
// requiring a folder prefix.
export async function waitForDistinctActiveNote(
  previous: string | null | undefined,
  options: { folder?: string; timeoutMsg?: string } = {},
): Promise<string> {
  let path = "";
  await waitForState(
    activeNotePath,
    (active) => {
      path = active;
      if (active === previous) return false;
      return options.folder === undefined || active.startsWith(`${options.folder}/`);
    },
    options.timeoutMsg ??
      (options.folder === undefined
        ? "waited for a different active note"
        : `waited for a different active note under ${options.folder}/`),
  );
  return path;
}

export function waitForActiveNote(path: string): Promise<void> {
  return waitForState(activeNotePath, (active) => active === path, `waited for ${path} to become the active note`);
}

// Today's date as a YYYY-MM-DD anchor, computed in the Node test process. The runner and the
// Obsidian renderer share the machine's local date, so this matches the plugin's notion of today
// (modulo the midnight boundary, same assumption the decoration fixtures already rely on).
export function todayAnchor(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
