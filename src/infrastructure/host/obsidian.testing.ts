import { parse as yamlParse, stringify as yamlStringify } from "yaml";

export { default as moment } from "moment";

// Only the flags PlatformService reads. Tests that need another platform override PlatformService
// through the container rather than mutating this.
export const Platform = { isMobileApp: false, isMacOS: false };

export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  stat = { ctime: 0, mtime: 0, size: 0 };
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  isRoot(): boolean {
    return this.parent === null;
  }
}

export class Notice {
  constructor(public message: string | DocumentFragment) {
    shownNotices.push(this);
  }
  setMessage(message: string | DocumentFragment): this {
    this.message = message;
    return this;
  }
  hide(): void {}
}

// Obsidian renders its own tooltip layer; the real one attaches listeners rather than writing an
// attribute. Recording it on the element keeps it observable without pretending to be that layer.
export function setTooltip(el: HTMLElement, tooltip: string): void {
  el.dataset.tooltip = tooltip;
}

// Real Obsidian returns null for a name outside its icon registry, and UiIcon's false arm is
// only reachable through that. The seeded set is a test-controlled registry, not a copy of
// Obsidian's — a test that needs a name present seeds it.
const DEFAULT_ICON_IDS = ["calendar", "calendar-days", "book-open", "file-text", "terminal"];
let iconIds = new Set(DEFAULT_ICON_IDS);

export function getIcon(name: string): SVGSVGElement | null {
  if (!iconIds.has(name)) return null;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.dataset.icon = name;
  return svg;
}

export function getIconIds(): string[] {
  return [...iconIds];
}

interface TagSourceCache {
  tags?: { tag: string }[];
  frontmatter?: Record<string, unknown>;
}

// Stand-in for Obsidian's combiner: inline tags already carry the "#", frontmatter ones
// (tag/tags, string, comma-separated string, or array) do not and get it added.
function frontmatterTagList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return raw.split(",");
  return [];
}

export function parseFrontMatterTags(frontmatter: Record<string, unknown> | null | undefined): string[] | null {
  if (!frontmatter) return null;
  const raw: unknown = frontmatter.tags ?? frontmatter.tag;
  if (raw === undefined || raw === null) return null;
  return frontmatterTagList(raw)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith("#") ? value : `#${value}`));
}

export function getAllTags(cache: TagSourceCache): string[] | null {
  const inline = cache.tags?.map((entry) => entry.tag) ?? [];
  const front = parseFrontMatterTags(cache.frontmatter) ?? [];
  return [...new Set([...inline, ...front])];
}

export function normalizePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replaceAll(/\/{2,}/g, "/")
    .replaceAll(/^\/|\/$/g, "");
}

export type App = unknown;

export function getLanguage(): string {
  return "en";
}

export class Plugin {
  readonly app: App;
  readonly manifest: { id: string; version: string; dir?: string };
  readonly settingTabs: PluginSettingTab[] = [];
  readonly protocolHandlers = new Map<string, (parameters: Record<string, string>) => unknown>();

  constructor(app: App, manifest: { id: string; version: string; dir?: string }) {
    this.app = app;
    this.manifest = manifest;
  }

  register(_callback: () => void): void {}

  registerEvent(_eventRef: unknown): void {}

  registerMarkdownCodeBlockProcessor(
    _language: string,
    _handler: (source: string, element: HTMLElement, context: MarkdownPostProcessorContext) => unknown,
  ): void {}

  addCommand<T>(command: T): T {
    return command;
  }

  removeCommand(_id: string): void {}

  registerView(_viewType: string, _viewCreator: (leaf: WorkspaceLeaf) => ItemView): void {}

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  registerObsidianProtocolHandler(action: string, handler: (parameters: Record<string, string>) => unknown): void {
    this.protocolHandlers.set(action, handler);
  }

  loadData(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  saveData(_data: unknown): Promise<void> {
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  readonly app: App;
  readonly containerEl: HTMLElement;

  constructor(app: App, _plugin: unknown) {
    this.app = app;
    this.containerEl = document.createElement("div");
  }

  display(): void {}

  hide(): void {}
}

export class Modal {
  readonly app: App;
  readonly titleEl: HTMLElement;
  readonly modalEl: HTMLElement;
  readonly contentEl: HTMLElement;
  #opened = false;

  constructor(app: App) {
    this.app = app;
    this.modalEl = document.createElement("div");
    this.titleEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.modalEl.append(this.titleEl, this.contentEl);
  }

  open(): void {
    if (this.#opened) return;
    this.#opened = true;
    openModals.push(this);
    document.body.append(this.modalEl);
    this.onOpen();
  }

  close(): void {
    if (!this.#opened) return;
    this.#opened = false;
    const index = openModals.indexOf(this);
    if (index !== -1) openModals.splice(index, 1);
    this.onClose();
    this.modalEl.remove();
  }

  onOpen(): void {}

  onClose(): void {}
}

export class SuggestModal<T> {
  readonly app: App;
  readonly inputEl: HTMLInputElement;
  #opened = false;
  #placeholder = "";

  constructor(app: App) {
    this.app = app;
    this.inputEl = document.createElement("input");
  }

  setPlaceholder(text: string): void {
    this.#placeholder = text;
  }

  get placeholder(): string {
    return this.#placeholder;
  }

  open(): void {
    if (this.#opened) return;
    this.#opened = true;
    openSuggestModals.push(this);
  }

  close(): void {
    if (!this.#opened) return;
    this.#opened = false;
    const index = openSuggestModals.indexOf(this);
    if (index !== -1) openSuggestModals.splice(index, 1);
    this.onClose();
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_item: T, _element: HTMLElement): void {}

  onChooseSuggestion(_item: T, _event: MouseEvent | KeyboardEvent): void {}

  onClose(): void {}
}

export class AbstractInputSuggest<T> {
  readonly app: App;
  readonly inputEl: HTMLInputElement;
  #attached = false;

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
    this.#attached = true;
    attachedInputSuggests.push(this);
  }

  getSuggestions(_query: string): T[] | Promise<T[]> {
    return [];
  }

  renderSuggestion(_item: T, _element: HTMLElement): void {}

  selectSuggestion(_item: T, _event: MouseEvent | KeyboardEvent): void {}

  close(): void {
    if (!this.#attached) return;
    this.#attached = false;
    const index = attachedInputSuggests.indexOf(this);
    if (index !== -1) attachedInputSuggests.splice(index, 1);
  }

  get isAttached(): boolean {
    return this.#attached;
  }
}

export interface FakeMenuItemConfig {
  title?: string;
  icon?: string;
  checked?: boolean | null;
  onClick?: (event: MouseEvent | KeyboardEvent) => void;
}

export class MenuItem {
  title = "";
  icon = "";
  checked: boolean | null = null;
  section = "";
  warning = false;
  #onClick: (event: MouseEvent | KeyboardEvent) => void = () => {};

  setTitle(title: string): this {
    this.title = title;
    return this;
  }
  setIcon(icon: string): this {
    this.icon = icon;
    return this;
  }
  setChecked(checked: boolean | null): this {
    this.checked = checked;
    return this;
  }
  setSection(section: string): this {
    this.section = section;
    return this;
  }
  setWarning(warning: boolean): this {
    this.warning = warning;
    return this;
  }
  onClick(callback: (event: MouseEvent | KeyboardEvent) => void): this {
    this.#onClick = callback;
    return this;
  }
  click(event: MouseEvent | KeyboardEvent = new MouseEvent("click")): void {
    this.#onClick(event);
  }
}

export class Menu {
  readonly items: MenuItem[] = [];
  showAtMouseEventCalls: MouseEvent[] = [];
  // Obsidian defaults this on for macOS, and the native menu delivers a pick *after* it has
  // closed — the reverse of the DOM menu. The fake defaults to the hostile ordering so that
  // ordering-sensitive code fails here instead of only on a maintainer's Mac.
  useNativeMenu = true;
  #onHide: (() => void) | null = null;

  addItem(build: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    build(item);
    this.items.push(item);
    return this;
  }
  setUseNativeMenu(useNativeMenu: boolean): this {
    this.useNativeMenu = useNativeMenu;
    return this;
  }
  onHide(callback: () => void): this {
    this.#onHide = callback;
    return this;
  }
  // Picks an item the way the host would: the DOM menu runs the item callback and then hides,
  // the native menu hides first and lets Electron deliver the callback a task later.
  async pick(index: number): Promise<void> {
    const item = this.items[index];
    if (item === undefined) throw new Error(`No menu item at index ${String(index)}`);
    if (!this.useNativeMenu) {
      item.click();
      this.hide();
      return;
    }
    this.hide();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    item.click();
  }
  showAtMouseEvent(event: MouseEvent): void {
    this.showAtMouseEventCalls.push(event);
    openMenus.push(this);
  }
  showAtPosition(_position: { x: number; y: number }): void {
    openMenus.push(this);
  }
  hide(): void {
    const index = openMenus.indexOf(this);
    if (index !== -1) openMenus.splice(index, 1);
    this.#onHide?.();
  }
}

export interface WorkspaceLeaf {
  readonly containerEl: HTMLElement;
}

export class ItemView {
  readonly leaf: WorkspaceLeaf;
  readonly containerEl: HTMLElement;
  readonly contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.containerEl = (leaf as { containerEl?: HTMLElement }).containerEl ?? document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.append(this.contentEl);
  }

  getViewType(): string {
    return "";
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return "";
  }

  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }
}

export class MarkdownRenderChild {
  readonly containerEl: HTMLElement;
  #loaded = false;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  load(): void {
    if (this.#loaded) return;
    this.#loaded = true;
    this.onload();
  }

  unload(): void {
    if (!this.#loaded) return;
    this.#loaded = false;
    this.onunload();
  }

  onload(): void {}

  onunload(): void {}
}

export interface MarkdownPostProcessorContext {
  readonly sourcePath: string;
  addChild(child: MarkdownRenderChild): void;
}

// Obsidian parses with eemeli `yaml`, not js-yaml, and the frontmatter escaping decides by what
// the parser accepts — a fake on a different parser would pass tests Obsidian fails.
export function parseYaml(source: string): unknown {
  if (source.trim() === "") return null;
  return yamlParse(source);
}

// Obsidian's own options (app.js, 1.8.7 through 1.13.x): a null prints bare, and no line folds.
export function stringifyYaml(value: unknown): string {
  return yamlStringify(value, null, { nullStr: "", lineWidth: 0, aliasDuplicateObjects: false });
}

export interface FrontMatterInfo {
  readonly exists: boolean;
  readonly frontmatter: string;
  readonly from: number;
  readonly to: number;
  readonly contentStart: number;
}

// A transcription of Obsidian's getFrontMatterInfo (app.js, identical at 1.8.7 and 1.13.7): the
// block opens on a first-line `---` and closes on the first later `---` that starts a line.
export function getFrontMatterInfo(content: string): FrontMatterInfo {
  const none: FrontMatterInfo = { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  const open = /^---(\r?\n)/g;
  if (open.exec(content) === null) return none;
  const from = open.lastIndex;
  const close = /---(\r?\n|$)/g;
  close.lastIndex = from;
  let match = close.exec(content);
  while (match !== null && content.charAt(match.index - 1) !== "\n") match = close.exec(content);
  if (match === null) return none;
  return {
    exists: true,
    frontmatter: content.slice(from, match.index),
    from,
    to: match.index,
    contentStart: close.lastIndex,
  };
}

// Obsidian augments HTMLElement with a handful of helpers. Stub them here so
// tests that exercise code calling these APIs don't fail in happy-dom.
HTMLElement.prototype.empty = function (): void {
  this.replaceChildren();
};

const attachedInputSuggests: AbstractInputSuggest<unknown>[] = [];

const openModals: Modal[] = [];
const openSuggestModals: SuggestModal<unknown>[] = [];
const openMenus: Menu[] = [];
const shownNotices: Notice[] = [];

export const __testing = {
  get openModals(): readonly Modal[] {
    return openModals;
  },
  lastOpenModal(): Modal {
    const last = openModals.at(-1);
    if (!last) throw new Error("__testing.lastOpenModal() called before any modal opened");
    return last;
  },
  get openSuggestModals(): readonly SuggestModal<unknown>[] {
    return openSuggestModals;
  },
  lastOpenSuggestModal(): SuggestModal<unknown> {
    const last = openSuggestModals.at(-1);
    if (!last) throw new Error("__testing.lastOpenSuggestModal() called before any suggest opened");
    return last;
  },
  get attachedInputSuggests(): readonly AbstractInputSuggest<unknown>[] {
    return attachedInputSuggests;
  },
  lastAttachedInputSuggest(): AbstractInputSuggest<unknown> {
    const last = attachedInputSuggests.at(-1);
    if (!last) throw new Error("__testing.lastAttachedInputSuggest() called before any input-suggest attached");
    return last;
  },
  get openMenus(): readonly Menu[] {
    return openMenus;
  },
  lastOpenMenu(): Menu {
    const last = openMenus.at(-1);
    if (!last) throw new Error("__testing.lastOpenMenu() called before any menu opened");
    return last;
  },
  get shownNotices(): readonly Notice[] {
    return shownNotices;
  },
  lastShownNotice(): Notice {
    const last = shownNotices.at(-1);
    if (!last) throw new Error("__testing.lastShownNotice() called before any notice shown");
    return last;
  },
  reset(): void {
    for (const m of [...openModals]) m.close();
    openModals.length = 0;
    for (const m of [...openSuggestModals]) m.close();
    openSuggestModals.length = 0;
    for (const s of [...attachedInputSuggests]) s.close();
    attachedInputSuggests.length = 0;
    for (const m of [...openMenus]) m.hide();
    openMenus.length = 0;
    // Notices dismiss themselves; nothing holds one, so clearing the log is the whole reset.
    shownNotices.length = 0;
  },
  seedIcons(names: readonly string[]): void {
    for (const name of names) iconIds.add(name);
  },
  resetIcons(): void {
    iconIds = new Set(DEFAULT_ICON_IDS);
  },
};
