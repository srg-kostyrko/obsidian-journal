import { createNanoEvents } from "nanoevents";
import { Menu, TFile } from "obsidian";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
import { AsyncResult, InvariantError, None, Some } from "@/infrastructure/result";
import type { Option } from "@/infrastructure/result";
import { icons } from "@/ui/icons";

import { NoteWriteError, WorkspaceOpenError } from "../errors";
import { SuggestCancelled } from "../suggests/errors";

import { buildMarkdownLink } from "./markdown-link";
import { toPaneType } from "./obsidian-bridge";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type {
  ActiveEditorState,
  LineReplacement,
  MenuItemSpec,
  OpenMode,
  PinTarget,
  VaultPath,
  WorkspaceEvents,
} from "../types";
import type { Editor, MarkdownFileInfo, MarkdownView, WorkspaceLeaf } from "obsidian";

// Obsidian exposes link-preference settings only through the untyped Vault.getConfig.
interface ConfigurableVault {
  getConfig?(key: string): unknown;
}

// The confirm-and-delete prompt is an undocumented FileManager method (same one core
// file-explorer menus use) — used below to give the appended Delete item the native
// confirm-before-delete behavior.
interface DeletePromptingFileManager {
  promptForFileDeletion?(file: TFile): void;
}

// Declaring the section order is also undocumented, though core calls it on every file menu
// it builds before triggering the event.
interface SectionedMenu {
  addSections?(sections: readonly string[]): void;
}

// Obsidian sorts a menu by section on show, and items carrying no section sink below every
// registered one — so without this our contributed items landed under the trailing Delete.
// This is core's own file-explorer order, "" being the slot those section-less items take.
const FILE_MENU_SECTIONS = [
  "title",
  "open",
  "action-primary",
  "action",
  "info",
  "info.copy",
  "view",
  "system",
  "",
  "danger",
];

// How long after a native menu closes a pick may still arrive from the main process before
// the close is read as a cancel. Electron sends both in the same main-process turn, so the
// real gap is a single IPC hop; this is that hop with room for a loaded machine, not a
// measured bound. Sized generously on purpose — see pickFromMenu for why waiting is free.
export const NATIVE_PICK_DELIVERY_GRACE_MS = 500;

// The active editor may be a canvas embed rather than a MarkdownView, so neither is assumed.
interface SavingView {
  save(): Promise<void>;
  getMode(): string;
}

interface HoldingView {
  readonly editor: Editor;
  readonly view: Partial<SavingView>;
}

const HIGH_SURROGATE = /^[\uD800-\uDBFF]$/u;
const LOW_SURROGATE = /^[\uDC00-\uDFFF]$/u;

// The span of `before` that becomes `text`, with the common prefix and suffix left out and never
// cutting a surrogate pair in half.
function differenceOf(before: string, after: string): { start: number; end: number; text: string } {
  const shorter = Math.min(before.length, after.length);
  let start = 0;
  while (start < shorter && before[start] === after[start]) start++;
  if (start > 0 && HIGH_SURROGATE.test(before[start - 1] ?? "")) start--;
  let suffix = 0;
  while (suffix < shorter - start && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
    suffix++;
  }
  if (suffix > 0 && LOW_SURROGATE.test(before[before.length - suffix] ?? "")) suffix--;
  return { start, end: before.length - suffix, text: after.slice(start, after.length - suffix) };
}

export class WorkspaceService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  readonly #emitter: TypedEmitter<WorkspaceEvents> = createNanoEvents();

  readonly events: Subscribable<WorkspaceEvents> = this.#emitter;

  constructor() {
    this.#plugin.registerEvent(
      this.#app.workspace.on("active-leaf-change", (leaf) => {
        // Focusing a leaf with no file (e.g. the calendar sidebar) must not clear the active
        // note, or the calendar's active-day highlight would disappear whenever that sidebar
        // gets focus. Only react to leaves that carry a file.
        const file = this.#fileOf(leaf);
        if (!file) return;
        this.#emitter.emit("active-note-changed", this.#pathOf(file));
      }),
    );
    // Same-leaf navigation (a link click, open-in-place) fires file-open without an
    // active-leaf-change; both feed the active-note signal.
    this.#plugin.registerEvent(
      this.#app.workspace.on("file-open", (file) => {
        this.#emitter.emit("active-note-changed", this.#pathOf(file));
      }),
    );
  }

  async #open(path: VaultPath, mode: OpenMode, pin?: PinTarget): Promise<void> {
    if (pin) {
      await this.#openPinned(path, mode, pin);
      return;
    }
    // A tab/split/window request is the user asking for a new pane; only the default "active"
    // mode may collapse onto a leaf that already holds the note.
    const existing = mode === "active" ? this.#findOpenLeaf(path, this.#activeWindow()) : null;
    if (existing) {
      this.#app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new InvariantError(`not a file: ${path}`);
    await this.#app.workspace.getLeaf(toPaneType(mode)).openFile(file, { active: true });
  }

  async #openPinned(path: VaultPath, mode: OpenMode, pin: PinTarget): Promise<void> {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new InvariantError(`not a file: ${path}`);
    const pinned = this.#findPinnedLeaf(path, pin);
    if (pinned) {
      if (this.#pathIn(pinned) !== path) await pinned.openFile(file, { active: true });
      this.#app.workspace.setActiveLeaf(pinned, { focus: true });
      return;
    }
    // A leaf sitting unpinned in a sidebar is not a candidate to pin in place either — no open
    // mode puts a note there, so pinning it would leave the note stuck outside the main area.
    const existing = this.#findOpenLeaf(path, this.#activeWindow(), (leaf) => this.#inMainArea(leaf));
    if (existing) {
      existing.setPinned(true);
      this.#app.workspace.setActiveLeaf(existing, { focus: true });
      return;
    }
    // Pinned before the load: Obsidian makes the note the active file while it is still reading it
    // from disk, so pinning afterwards shows the note in an unpinned tab for that long — and a
    // second pinned open landing in that window misses this tab and pins another.
    const leaf = this.#app.workspace.getLeaf(toPaneType(mode));
    leaf.setPinned(true);
    try {
      await leaf.openFile(file, { active: true });
    } catch (error) {
      // A concurrent pinned open of the same journal may have moved this tab on to its own note
      // while the load was pending; that pin is now its, not ours to take back.
      const held = this.#pathIn(leaf);
      if (held === null || held === path) leaf.setPinned(false);
      throw error;
    }
  }

  // Unlike #findOpenLeaf this spans every window on purpose: the pinned tab is the place the user
  // chose for the group, so a window-scoped search would pin a second one from the main window.
  #findPinnedLeaf(path: VaultPath, pin: PinTarget): WorkspaceLeaf | null {
    const { workspace } = this.#app;
    const win = this.#activeWindow();
    const rank = (leaf: WorkspaceLeaf): number =>
      (this.#pathIn(leaf) === path ? 0 : 2) + (leaf.getContainer().win === win ? 0 : 1);
    const candidates = workspace.getLeavesOfType("markdown").filter((leaf) => {
      if (!this.#inMainArea(leaf)) return false;
      if (leaf.getViewState().pinned !== true) return false;
      const held = this.#pathIn(leaf);
      return held !== null && (held === path || pin.sameGroup(held));
    });
    return candidates.toSorted((x, y) => rank(x) - rank(y)).at(0) ?? null;
  }

  // No open mode puts a note in a sidebar, so a pinned open must never treat a sidebar-docked
  // leaf as a tab it can pin or retarget in place — shared by the pinned lookup and the
  // reuse-and-pin fallback.
  #inMainArea(leaf: WorkspaceLeaf): boolean {
    const root = leaf.getRoot();
    return root !== this.#app.workspace.leftSplit && root !== this.#app.workspace.rightSplit;
  }

  // Obsidian tracks the focused window here, differing from the main window only while a popout
  // holds focus. Read off containerEl rather than the `activeWindow` global so it stays injectable.
  #activeWindow(): Window {
    return this.#app.workspace.containerEl.win.activeWindow;
  }

  // getLeavesOfType spans popout windows, so reuse has to be pinned to one window or opening a
  // note already open elsewhere drags the user's focus to that other window.
  #findOpenLeaf(path: VaultPath, win?: Window, accept?: (leaf: WorkspaceLeaf) => boolean): WorkspaceLeaf | null {
    for (const leaf of this.#app.workspace.getLeavesOfType("markdown")) {
      if (win && leaf.getContainer().win !== win) continue;
      if (this.#pathIn(leaf) === path && (accept?.(leaf) ?? true)) return leaf;
    }
    return null;
  }

  // The active editor first, since a command ran there; otherwise a view in any window, because an
  // edit is not a focus change and a popout's unsaved typing is lost to a disk write all the same.
  // A deferred view has no file and no editor yet, so it holds nothing unsaved.
  #viewHolding(path: VaultPath): HoldingView | undefined {
    const active = this.#activeView();
    if (active?.file?.path === path && active.editor !== undefined) return { editor: active.editor, view: active };
    for (const leaf of this.#app.workspace.getLeavesOfType("markdown")) {
      if (leaf.isDeferred) continue;
      const view = leaf.view as MarkdownView | undefined;
      if (view?.file?.path === path && view.editor !== undefined) return { editor: view.editor, view };
    }
    return undefined;
  }

  // Reading mode keeps an editor that the user cannot type into or see a cursor in.
  #editingView(): { readonly file: TFile | null; readonly editor: Editor } | undefined {
    const active = this.#activeView();
    const editor = active?.editor;
    if (active === null || editor === undefined || active.getMode?.() === "preview") return undefined;
    return { file: active.file, editor };
  }

  #activeView(): (MarkdownFileInfo & Partial<SavingView>) | null {
    return this.#app.workspace.activeEditor;
  }

  #activeEditor(): Editor | undefined {
    return this.#app.workspace.activeEditor?.editor;
  }

  // An existing file goes through Obsidian's own generator; a target that does not exist yet is
  // linked by its full path so following the link creates the note where the journal expects it.
  #noteLink(targetPath: VaultPath): string {
    const target = this.#app.vault.getAbstractFileByPath(targetPath);
    if (target instanceof TFile) {
      const sourcePath = this.activeNote().getOr("" as VaultPath);
      return this.#app.fileManager.generateMarkdownLink(target, sourcePath);
    }
    return buildMarkdownLink({
      pathWithoutExtension: targetPath.replace(/\.md$/, ""),
      basename: (targetPath.split("/").pop() ?? targetPath).replace(/\.md$/, ""),
      useMarkdownLinks: this.#vaultConfig("useMarkdownLinks") === true,
    });
  }

  #vaultConfig(key: string): unknown {
    return (this.#app.vault as unknown as ConfigurableVault).getConfig?.(key);
  }

  #fileOf(leaf: WorkspaceLeaf | null): TFile | null {
    const view = leaf?.view as MarkdownView | undefined;
    return view?.file ?? null;
  }

  // Since Obsidian 1.7.2 a leaf restored into a background tab holds a deferred view until it is
  // first shown: it reports the "markdown" type but has no file, which survives only in the view
  // state it was restored with.
  #pathIn(leaf: WorkspaceLeaf): VaultPath | null {
    const file = this.#fileOf(leaf);
    if (file) return file.path as VaultPath;
    const held = leaf.getViewState().state?.file;
    return typeof held === "string" ? (held as VaultPath) : null;
  }

  #pathOf(file: TFile | null): Option<VaultPath> {
    if (!(file instanceof TFile)) return new None<VaultPath>();
    return new Some<VaultPath>(file.path as VaultPath);
  }

  activeNote(): Option<VaultPath> {
    return this.#pathOf(this.#app.workspace.getActiveFile());
  }

  get layoutReady(): boolean {
    return this.#app.workspace.layoutReady;
  }

  onLayoutReady(callback: () => void): void {
    this.#app.workspace.onLayoutReady(callback);
  }

  isOpen(path: VaultPath): boolean {
    return this.#findOpenLeaf(path) !== null;
  }

  openNote(path: VaultPath, mode: OpenMode = "active", pin?: PinTarget): AsyncResult<void, WorkspaceOpenError> {
    return AsyncResult.fromPromise(this.#open(path, mode, pin), (cause) => new WorkspaceOpenError(path, cause));
  }

  hasActiveEditor(): boolean {
    return this.#activeEditor() !== undefined;
  }

  /** Whether the active note is open in an editor the user can type into, not in reading mode. */
  isEditingActiveNote(): boolean {
    return this.#editingView() !== undefined;
  }

  activeEditorState(): Option<ActiveEditorState> {
    const active = this.#editingView();
    const file = active?.file;
    if (active === undefined || !(file instanceof TFile)) return new None<ActiveEditorState>();
    return new Some<ActiveEditorState>({
      path: file.path as VaultPath,
      content: active.editor.getValue(),
      cursorLine: active.editor.getCursor().line,
    });
  }

  /** The text of an open view of `path`, unsaved typing included. */
  openNoteText(path: VaultPath): Option<string> {
    const editor = this.#viewHolding(path)?.editor;
    return editor === undefined ? new None<string>() : new Some<string>(editor.getValue());
  }

  // One replaceRange spanning only what changed: an edit covering the whole buffer would move the
  // cursor and fold state of anyone typing there, and writing through vault.process instead loses
  // the typing the view has not saved.
  /** Rewrites an open view of `path` through `transform`, or refuses when it returns null. */
  processOpenNote(path: VaultPath, transform: (content: string) => string | null): "applied" | "refused" | "not-open" {
    const editor = this.#viewHolding(path)?.editor;
    if (editor === undefined) return "not-open";
    const before = editor.getValue();
    const after = transform(before);
    if (after === null) return "refused";
    const { start, end, text } = differenceOf(before, after);
    if (start !== end || text !== "") editor.replaceRange(text, editor.offsetToPos(start), editor.offsetToPos(end));
    return "applied";
  }

  // A view saves on a debounce, so an edit made through it reaches disk only later; a caller that
  // must order its writes on disk saves first.
  /** Saves the open view of `path`, unsaved typing included; nothing when no view holds it. */
  saveOpenNote(path: VaultPath): AsyncResult<void, NoteWriteError> {
    const view = this.#viewHolding(path)?.view;
    return AsyncResult.fromPromise(Promise.resolve(view?.save?.()), (cause) => new NoteWriteError(path, cause));
  }

  // One replaceRange is one undo step. The verdict is reached on the buffer as it stands now, so
  // typing since the caller read it can only refuse the change, never shift where it lands.
  /** Replaces a line range in an open view of `path` if `verify` approves it against that view's text. */
  replaceLinesInOpenNote(
    path: VaultPath,
    verify: (content: string) => LineReplacement | null,
  ): "applied" | "refused" | "not-open" {
    const editor = this.#viewHolding(path)?.editor;
    if (editor === undefined) return "not-open";
    const change = verify(editor.getValue());
    const last = editor.lastLine();
    if (change === null || change.from < 0 || change.to < change.from || change.to > last) return "refused";
    const { from, to, lines } = change;
    const endOf = (line: number) => ({ line, ch: editor.getLine(line).length });
    if (to < last) {
      editor.replaceRange(lines.map((line) => `${line}\n`).join(""), { line: from, ch: 0 }, { line: to + 1, ch: 0 });
    } else if (lines.length > 0) {
      editor.replaceRange(lines.join("\n"), { line: from, ch: 0 }, endOf(to));
    } else {
      // The last line has no newline of its own to take, so the one ending the line above goes.
      editor.replaceRange("", from === 0 ? { line: 0, ch: 0 } : endOf(from - 1), endOf(to));
    }
    return "applied";
  }

  insertNoteLinkAtCursor(targetPath: VaultPath): boolean {
    const editor = this.#activeEditor();
    if (editor === undefined) return false;
    editor.replaceSelection(this.#noteLink(targetPath));
    return true;
  }

  triggerHoverPreview(path: VaultPath, event: MouseEvent): void {
    this.#app.workspace.trigger("link-hover", this.#plugin, event.target, path, path);
  }

  // Returns whether the file resolved and the menu was populated, so a caller building a
  // combined menu can decline to show an empty one.
  openFileMenu(path: VaultPath, event: MouseEvent, into?: Menu): boolean {
    const file = this.#app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    const menu = into ?? new Menu();
    (menu as SectionedMenu).addSections?.(FILE_MENU_SECTIONS);
    this.#app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
    // The file-menu event does not guarantee a Delete entry, so append one explicitly.
    menu.addItem((item) =>
      item
        .setTitle(m.common_action_delete())
        .setIcon(icons.action.delete)
        // Obsidian's own file menus put deletion in the trailing danger section and paint it
        // with the error color; matching that keeps our menu indistinguishable from a core one.
        .setSection("danger")
        .setWarning(true)
        .onClick(() => {
          (this.#app.fileManager as DeletePromptingFileManager).promptForFileDeletion?.(file);
        }),
    );
    // A menu we were handed belongs to the caller, who decides when to show it.
    if (!into) menu.showAtMouseEvent(event);
    return true;
  }

  openPathsMenu(paths: readonly VaultPath[], event: MouseEvent, extraItems: readonly MenuItemSpec[] = []): void {
    const [first] = paths;
    if (first === undefined && extraItems.length === 0) return;

    const menu = new Menu();
    for (const spec of extraItems) {
      menu.addItem((item) => item.setTitle(spec.title).setIcon(spec.icon).onClick(spec.onClick));
    }

    if (first !== undefined) {
      if (paths.length === 1) {
        // A stale index path that no longer resolves to a file must not surface an empty
        // popup where the pre-refactor code showed nothing; only the caller's own extras
        // (if any) justify still opening the menu.
        const populated = this.openFileMenu(first, event, menu);
        if (!populated && extraItems.length === 0) return;
      } else {
        for (const path of paths) {
          menu.addItem((item) => item.setTitle(path).onClick(() => this.openFileMenu(path, event)));
        }
      }
    }

    menu.showAtMouseEvent(event);
  }

  // A pick-one menu at the pointer, for disambiguating when multiple journals apply.
  //
  // Obsidian renders a Menu two ways and they put the pick on opposite sides of the close.
  // The DOM menu runs the item callback and *then* hides. The native (Electron) menu — the
  // default on macOS — hides on "menu-will-close" and only then lets the pick cross IPC from
  // the main process. Electron has no "and no pick is coming" signal, so under the native
  // rendering the close cannot be the cancel verdict; it can only start the wait for one.
  //
  // Hence the grace below rather than the old zero-delay verdict, which cancelled every
  // native pick before it arrived (issue #238). A late cancel is free: Flows logs UserAborted
  // and shows nothing, and no caller reacts to it, so nothing observable is waiting on it —
  // while a dropped pick costs the user the note they asked for. A pick that lands first
  // short-circuits, so the DOM rendering never even arms the timer.
  pickFromMenu(labels: readonly string[], event: MouseEvent): AsyncResult<string, SuggestCancelled> {
    return AsyncResult.fromPromise(
      new Promise<string>((resolve, reject) => {
        const menu = new Menu();
        let chosen = false;
        for (const label of labels) {
          menu.addItem((item) =>
            item.setTitle(label).onClick(() => {
              chosen = true;
              resolve(label);
            }),
          );
        }
        menu.onHide(() => {
          if (chosen) return;
          window.setTimeout(() => {
            if (!chosen) reject(new SuggestCancelled());
          }, NATIVE_PICK_DELIVERY_GRACE_MS);
        });
        menu.showAtMouseEvent(event);
      }),
      (cause) => (cause instanceof SuggestCancelled ? cause : new SuggestCancelled()),
    );
  }

  // Callers gate this behind useModifierHoverPreview, which also covers a modifier
  // pressed while already hovering (the stored enter event carries no modifier flags).
  previewFirstPath(paths: readonly VaultPath[], event: MouseEvent): void {
    const [first] = paths;
    if (first === undefined) return;
    this.triggerHoverPreview(first, event);
  }
}
