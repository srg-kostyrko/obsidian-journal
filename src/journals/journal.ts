import { computed, type ComputedRef } from "vue";
import type {
  JournalCommand,
  JournalDecoration,
  JournalSettings,
  NavBlockRow,
  WriteCustom,
} from "../types/settings.types";
import type { AnchorDateResolver, JournalAnchorDate, JournalMetadata, JournalNoteData } from "../types/journal.types";
import { normalizePath, TFile, type LeftRibbon } from "obsidian";
import { ensureFolderExists } from "../utils/io";
import { replaceTemplateVariables, tryApplyingTemplater } from "../utils/template";
import type { TemplateContext } from "../types/template.types";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_DATE_KEY,
} from "../constants";
import { FixedIntervalResolver } from "./fixed-interval";
import { date_from_string, today } from "../calendar";
import { VueModal } from "@/components/modals/vue-modal";
import ConfirmNoteCreationModal from "@/components/modals/ConfirmNoteCreation.modal.vue";
import { disconnectNote } from "@/utils/journals";
import { CustomIntervalResolver } from "./custom-interval";
import type { JournalPlugin } from "@/types/plugin.types";

export class Journal {
  readonly name$: ComputedRef<string>;
  readonly config: ComputedRef<JournalSettings>;
  #anchorDateResolver: AnchorDateResolver;

  constructor(
    public readonly name: string,
    private plugin: JournalPlugin,
  ) {
    this.config = computed(() => plugin.getJournalConfig(name));
    this.name$ = computed(() => this.config.value.name);
    this.#anchorDateResolver =
      this.config.value.write.type === "custom"
        ? new CustomIntervalResolver(
            this.plugin,
            this.name$.value,
            computed(() => this.config.value.write) as ComputedRef<WriteCustom>,
          )
        : new FixedIntervalResolver(
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            computed(() => this.config.value.write),
          );
  }

  get type(): JournalSettings["write"]["type"] {
    return this.config.value.write.type;
  }

  get dateFormat(): JournalSettings["dateFormat"] {
    return this.config.value.dateFormat;
  }

  get navBlock(): JournalSettings["navBlock"] {
    return this.config.value.navBlock;
  }

  get decorations(): JournalSettings["decorations"] {
    return this.config.value.decorations;
  }

  get commands(): JournalSettings["commands"] {
    return this.config.value.commands;
  }

  get isOnShelf(): boolean {
    return this.config.value.shelves.length > 0;
  }

  get shelfName(): string {
    return this.config.value.shelves[0] ?? "";
  }

  calculateOffset(date: string): [positive: number, negative: number] {
    return this.#anchorDateResolver.calculateOffset(date);
  }

  registerCommands(): void {
    for (const command of this.config.value.commands) {
      this.plugin.addCommand({
        id: this.name + ":" + command.name,
        name: `${this.config.value.name}: ${command.name}`,
        icon: command.icon,
        checkCallback: (checking: boolean): boolean => {
          if (checking) {
            return this.#checkCommand(command);
          } else {
            this.#execCommand(command).catch(console.error);
          }
          return true;
        },
      });
      if (command.showInRibbon) {
        const ribbonId = "journals:" + this.name + ":" + command.name;
        const item = (this.plugin.app.workspace.leftRibbon as LeftRibbon).addRibbonItemButton(
          ribbonId,
          command.icon,
          command.name,
          () => {
            if (!this.#checkCommand(command)) return;
            this.#execCommand(command).catch(console.error);
          },
        );
        this.plugin.register(() => {
          (this.plugin.app.workspace.leftRibbon as LeftRibbon).removeRibbonAction(ribbonId);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          item.detach();
        });
      }
    }
  }

  get(date: string): JournalNoteData | JournalMetadata | null {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    const metadata = this.plugin.index.get(this.name, anchorDate);
    if (metadata) return metadata;
    if (!this.#checkBounds(anchorDate)) return null;
    return this.#buildMetadata(anchorDate);
  }

  next(date: string, existing = false): JournalNoteData | JournalMetadata | null {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    if (existing) {
      const nextExstingMetadata = this.plugin.index.findNext(this.name, anchorDate);
      if (nextExstingMetadata) return nextExstingMetadata;
    }
    const nextAnchorDate = this.#anchorDateResolver.resolveNext(anchorDate);
    if (!nextAnchorDate) return null;
    const nextMetadata = this.plugin.index.get(this.name, nextAnchorDate);
    if (nextMetadata) return nextMetadata;
    if (!this.#checkBounds(nextAnchorDate)) return null;
    return this.#buildMetadata(nextAnchorDate);
  }

  previous(date: string, existing = false): JournalNoteData | JournalMetadata | null {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    if (existing) {
      const previousExstingMetadata = this.plugin.index.findPrevious(this.name, anchorDate);
      if (previousExstingMetadata) return previousExstingMetadata;
    }
    const previousAnchorDate = this.#anchorDateResolver.resolvePrevious(anchorDate);
    if (!previousAnchorDate) return null;
    const previousMetadata = this.plugin.index.get(this.name, previousAnchorDate);
    if (previousMetadata) return previousMetadata;
    if (!this.#checkBounds(previousAnchorDate)) return null;
    return this.#buildMetadata(previousAnchorDate);
  }

  async open(metadata: JournalMetadata): Promise<void> {
    const file = await this.#ensureNote(metadata);
    if (!file) return;
    await this.#openFile(file);
  }

  resolveAnchorDate(date: string): JournalAnchorDate | null {
    return this.#anchorDateResolver.resolveForDate(date);
  }

  resolveStartDate(anchorDate: JournalAnchorDate): string {
    return this.#anchorDateResolver.resolveStartDate(anchorDate);
  }
  resolveEndDate(anchorDate: JournalAnchorDate): string {
    return this.#anchorDateResolver.resolveEndDate(anchorDate);
  }
  resolveRelativeDate(anchorDate: JournalAnchorDate): string {
    return this.#anchorDateResolver.resolveRelativeDate(anchorDate);
  }

  addCommand(command: JournalCommand): void {
    this.config.value.commands.push(command);
    this.plugin.requestReloadHint();
  }

  updateCommand(index: number, command: JournalCommand): void {
    this.config.value.commands[index] = command;
    this.plugin.requestReloadHint();
  }

  deleteCommand(index: number): void {
    this.config.value.commands.splice(index, 1);
    this.plugin.requestReloadHint();
  }

  addDecoration(decoration: JournalDecoration): void {
    this.config.value.decorations.push(decoration);
  }

  editDecoration(index: number, decoration: JournalDecoration): void {
    this.config.value.decorations[index] = decoration;
  }

  deleteDecoration(index: number): void {
    this.config.value.decorations.splice(index, 1);
  }

  addNavRow(row: NavBlockRow): void {
    this.config.value.navBlock.rows.push(row);
  }

  editNavRow(index: number, row: NavBlockRow): void {
    this.config.value.navBlock.rows[index] = row;
  }

  deleteNavRow(index: number): void {
    this.config.value.navBlock.rows.splice(index, 1);
  }

  moveNavRowUp(index: number) {
    if (index > 0) {
      const temporary = this.config.value.navBlock.rows[index];
      this.config.value.navBlock.rows[index] = this.config.value.navBlock.rows[index - 1];
      this.config.value.navBlock.rows[index - 1] = temporary;
    }
  }
  moveNavRowDown(index: number) {
    if (index < this.config.value.navBlock.rows.length - 1) {
      const temporary = this.config.value.navBlock.rows[index];
      this.config.value.navBlock.rows[index] = this.config.value.navBlock.rows[index + 1];
      this.config.value.navBlock.rows[index + 1] = temporary;
    }
  }

  async #openFile(file: TFile): Promise<void> {
    const mode = this.config.value.openMode === "active" ? undefined : this.config.value.openMode;
    const leaf = this.plugin.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  async #ensureNote(metadata: JournalMetadata): Promise<TFile | null> {
    const filePath = this.getNotePath(metadata);
    let file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      const templateContext = this.#getTemplateContext(metadata);
      const noteName = replaceTemplateVariables(this.config.value.nameTemplate, templateContext);
      if (this.config.value.confirmCreation && !(await this.#confirmNoteCreation(noteName))) {
        return null;
      }
      await ensureFolderExists(this.plugin.app, filePath);
      file = await this.plugin.app.vault.create(filePath, "");
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");

      templateContext.note_name = { type: "string", value: noteName };
      const content = await this.#getNoteContent(file, templateContext);
      if (content) await this.plugin.app.vault.modify(file, content);
    }
    if (!(file instanceof TFile)) throw new Error("File is not a TFile");
    await this.#ensureFrontMatter(file, metadata);
    return file;
  }

  #confirmNoteCreation(noteName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new VueModal(
        this.plugin,
        "Confirm note creation",
        ConfirmNoteCreationModal,
        {
          journalName: this.name$.value,
          noteName,
          onConfirm(confirm: boolean) {
            modal.close();
            resolve(confirm);
          },
          onClose() {
            modal.close();
            resolve(false);
          },
        },
        400,
      );
      modal.open();
    });
  }

  getConfiguredPathData(metadata: JournalMetadata): [string, string] {
    const templateContext = this.#getTemplateContext(metadata);
    const filename = replaceTemplateVariables(this.config.value.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.config.value.folder, templateContext) || "/";
    return [folderPath, filename];
  }

  getNotePath(metadata: JournalNoteData | JournalMetadata): string {
    if ("path" in metadata) return metadata.path;
    const templateContext = this.#getTemplateContext(metadata);
    const filename = replaceTemplateVariables(this.config.value.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.config.value.folder, templateContext);
    return normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
  }

  async connectNote(
    file: TFile,
    anchorDate: JournalAnchorDate,
    options: {
      override?: boolean;
      rename?: boolean;
      move?: boolean;
    },
  ): Promise<boolean> {
    const metadata = this.get(anchorDate);
    if (!metadata) return false;
    if ("path" in metadata) {
      if (!options.override) return false;
      await disconnectNote(this.plugin.app, metadata.path);
    }
    let path = file.path;
    if (options.rename || options.move) {
      const [configuredFolder, configuredFilename] = this.getConfiguredPathData(metadata);
      const folderPath = options.move ? configuredFolder : file.parent?.path;
      const filename = options.rename ? configuredFilename : file.name;
      path = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
      await ensureFolderExists(this.plugin.app, path);
      await this.plugin.app.vault.rename(file, path);
      file = this.plugin.app.vault.getAbstractFileByPath(path) as TFile;
    }

    await this.#ensureFrontMatter(file, metadata);
    return true;
  }

  #getTemplateContext(metadata: JournalMetadata): TemplateContext {
    return {
      date: {
        type: "date",
        value: metadata.date,
        defaultFormat: this.config.value.dateFormat,
      },
      start_date: {
        type: "date",
        value: this.#anchorDateResolver.resolveStartDate(metadata.date),
        defaultFormat: this.config.value.dateFormat,
      },
      end_date: {
        type: "date",
        value: metadata.end_date ?? this.#anchorDateResolver.resolveEndDate(metadata.date),
        defaultFormat: this.config.value.dateFormat,
      },
      journal_name: {
        type: "string",
        value: this.config.value.name,
      },
      index: {
        type: "number",
        value: metadata.index,
      },
    };
  }

  async #getNoteContent(note: TFile, context: TemplateContext): Promise<string> {
    if (this.config.value.templates.length > 0) {
      for (const template of this.config.value.templates) {
        const path = replaceTemplateVariables(template.endsWith(".md") ? template : template + ".md", context);
        const templateFile = this.plugin.app.vault.getAbstractFileByPath(path);
        if (templateFile instanceof TFile) {
          const templateContent = await this.plugin.app.vault.cachedRead(templateFile);
          return tryApplyingTemplater(
            this.plugin.app,
            templateFile,
            note,
            replaceTemplateVariables(templateContent, context),
          );
        }
      }
    }
    return "";
  }
  async #ensureFrontMatter(note: TFile, metadata: JournalMetadata): Promise<void> {
    await this.plugin.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, string | number>) => {
      frontmatter[FRONTMATTER_NAME_KEY] = this.name;
      frontmatter[FRONTMATTER_DATE_KEY] = date_from_string(metadata.date).format(FRONTMATTER_DATE_FORMAT);
      if (metadata.end_date) {
        frontmatter[FRONTMATTER_END_DATE_KEY] = date_from_string(metadata.end_date).format(FRONTMATTER_DATE_FORMAT);
      } else {
        delete frontmatter[FRONTMATTER_END_DATE_KEY];
      }
      if (metadata.index == null) {
        delete frontmatter[FRONTMATTER_INDEX_KEY];
      } else {
        frontmatter[FRONTMATTER_INDEX_KEY] = metadata.index;
      }
    });
  }

  #buildMetadata(anchorDate: JournalAnchorDate): JournalMetadata {
    const metadata: JournalMetadata = {
      journal: this.name,
      date: anchorDate,
      index: this.#resolveIndex(anchorDate),
    };
    return metadata;
  }

  #checkCommand(command: JournalCommand): boolean {
    if (command.context === "only_open_note") {
      if (!this.plugin.activeNote) return false;
      const metadata = this.plugin.index.getForPath(this.plugin.activeNote.path);
      if (!metadata) return false;
      if (metadata.journal !== this.name) return false;
    }
    return true;
  }

  async #execCommand(command: JournalCommand): Promise<void> {
    const refDate = this.#getCommandRefDate(command);
    if (!refDate) return;
    const date = this.#anchorDateResolver.resolveDateForCommand(refDate, command.type);
    if (!date) return;
    const metadata = this.get(date);
    if (!metadata) return;
    await this.open(metadata);
  }

  #getCommandRefDate(command: JournalCommand): string | null {
    const activeNode = this.plugin.activeNote;
    const metadata = activeNode ? this.plugin.index.getForPath(activeNode.path) : null;
    if (metadata && command.context !== "today") {
      return metadata.date;
    }
    if (command.context === "only_open_note") return null;
    return today().format(FRONTMATTER_DATE_FORMAT);
  }

  #checkBounds(anchorDate: JournalAnchorDate): boolean {
    if (this.config.value.start) {
      const startDate = date_from_string(this.config.value.start);
      if (startDate.isValid() && date_from_string(anchorDate).isBefore(startDate)) return false;
    }

    if (this.config.value.end.type === "date" && this.config.value.end.date) {
      const endDate = date_from_string(this.config.value.end.date);
      if (endDate.isValid() && date_from_string(anchorDate).isAfter(endDate)) return false;
    }
    if (this.config.value.end.type === "repeats" && this.config.value.end.repeats && this.config.value.start) {
      const repeats = this.#anchorDateResolver.countRepeats(this.config.value.start, anchorDate);
      if (repeats > this.config.value.end.repeats) return false;
    }

    return true;
  }

  #resolveIndex(anchorDate: JournalAnchorDate): number | undefined {
    if (!this.config.value.index.enabled) return undefined;
    if (!this.config.value.index.anchorDate || !this.config.value.index.anchorIndex) return undefined;
    const before = this.previous(anchorDate, true);
    if (before?.index) {
      const repeats = this.#anchorDateResolver.countRepeats(before.date, anchorDate);
      let index = before.index + repeats;
      if (this.config.value.index.type === "reset_after") {
        index %= this.config.value.index.resetAfter;
      }
      return index;
    }
    const after = this.next(anchorDate, true);
    if (after?.index) {
      const repeats = this.#anchorDateResolver.countRepeats(anchorDate, after.date);
      let index = after.index - repeats;
      if (this.config.value.index.type === "reset_after" && index < 0) {
        index *= -1;
      }
      return index;
    }
    const anchor = date_from_string(this.config.value.index.anchorDate);
    if (!anchor.isValid()) return undefined;
    if (
      anchor.isAfter(anchorDate) &&
      this.config.value.index.type === "increment" &&
      !this.config.value.index.allowBefore
    )
      return undefined;
    if (anchor.isBefore(anchorDate)) {
      const repeats = this.#anchorDateResolver.countRepeats(this.config.value.index.anchorDate, anchorDate);
      let index = this.config.value.index.anchorIndex + repeats;
      if (this.config.value.index.type === "reset_after") {
        index %= this.config.value.index.resetAfter;
      }
      return index;
    }
    const repeats = this.#anchorDateResolver.countRepeats(anchorDate, this.config.value.index.anchorDate);
    let index = this.config.value.index.anchorIndex - repeats;
    if (this.config.value.index.type === "reset_after" && index < 0) {
      index *= -1;
    }
    return index;
  }
}
