import { computed, type ComputedRef, type Ref } from "vue";
import type {
  JournalCommand,
  JournalDecoration,
  JournalSettings,
  NavBlockRow,
  OpenMode,
  WriteCustom,
} from "../types/settings.types";
import type { AnchorDateResolver, JournalAnchorDate, JournalMetadata, JournalNoteData } from "../types/journal.types";
import { normalizePath, TFile } from "obsidian";
import { replaceTemplateVariables } from "../utils/template";
import type { TemplateContext } from "../types/template.types";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_NAME_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_DATE_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";
import { FixedIntervalResolver } from "./fixed-interval";
import { date_from_string, today } from "../calendar";
import { CustomIntervalResolver } from "./custom-interval";
import type { AppManager, NotesManager } from "@/types/plugin.types";
import type { JournalsIndex } from "./journals-index";

export class Journal {
  #anchorDateResolver: AnchorDateResolver;

  constructor(
    public readonly name: string,
    readonly config: ComputedRef<JournalSettings>,
    private index: JournalsIndex,
    private appManager: AppManager,
    private notesManager: NotesManager,
    private activeNote: Ref<string | null>,
  ) {
    this.#anchorDateResolver =
      this.config.value.write.type === "custom"
        ? new CustomIntervalResolver(
            this.name,
            computed(() => this.config.value.write) as ComputedRef<WriteCustom>,
            this.index,
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

  get calendarViewBlock(): JournalSettings["calendarViewBlock"] {
    return this.config.value.calendarViewBlock;
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

  get startDate(): string {
    return this.config.value.start;
  }

  get endDate(): string {
    switch (this.config.value.end.type) {
      case "date": {
        return this.config.value.end.date;
      }
      case "repeats": {
        const start = date_from_string(this.startDate);
        if (!start.isValid()) return "";

        const end = start
          .clone()
          .add(this.config.value.end.repeats * this.#anchorDateResolver.repeats, this.#anchorDateResolver.duration);

        return end.format(FRONTMATTER_DATE_FORMAT);
      }
    }

    return "";
  }

  get frontmatterDate(): string {
    return this.config.value.frontmatter.dateField || FRONTMATTER_DATE_KEY;
  }

  get frontmatterIndex(): string {
    return this.config.value.frontmatter.indexField || FRONTMATTER_INDEX_KEY;
  }

  get frontmatterStartDate(): string {
    return this.config.value.frontmatter.startDateField || FRONTMATTER_START_DATE_KEY;
  }

  get frontmatterEndDate(): string {
    return this.config.value.frontmatter.endDateField || FRONTMATTER_END_DATE_KEY;
  }

  calculateOffset(date: string): [positive: number, negative: number] {
    return this.#anchorDateResolver.calculateOffset(date);
  }

  registerCommands(): void {
    for (const command of this.config.value.commands) {
      this.#addCommand(command);
    }
  }

  get(date: string): JournalNoteData | JournalMetadata | null {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    const metadata = this.index.get(this.name, anchorDate);
    if (metadata) return metadata;
    if (!this.#checkBounds(anchorDate)) return null;
    return this.#buildMetadata(anchorDate);
  }

  next(date: string, existing = false): JournalNoteData | JournalMetadata | null {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    if (existing) {
      return this.index.findNext(this.name, anchorDate);
    }
    const nextAnchorDate = this.#anchorDateResolver.resolveNext(anchorDate);
    if (!nextAnchorDate) return null;
    const nextMetadata = this.index.get(this.name, nextAnchorDate);
    if (nextMetadata) return nextMetadata;
    if (!this.#checkBounds(nextAnchorDate)) return null;
    return this.#buildMetadata(nextAnchorDate);
  }

  previous(date: string, existing = false): JournalNoteData | JournalMetadata | null {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    if (existing) {
      return this.index.findPrevious(this.name, anchorDate);
    }
    const previousAnchorDate = this.#anchorDateResolver.resolvePrevious(anchorDate);
    if (!previousAnchorDate) return null;
    const previousMetadata = this.index.get(this.name, previousAnchorDate);
    if (previousMetadata) return previousMetadata;
    if (!this.#checkBounds(previousAnchorDate)) return null;
    return this.#buildMetadata(previousAnchorDate);
  }

  getNoteNameForDate(date: string): string {
    const metadata = this.get(date);
    if (!metadata) return "";
    const templateContext = this.#getTemplateContext(metadata);
    return replaceTemplateVariables(this.config.value.nameTemplate, templateContext);
  }

  findAll(startDate: string, endDate: string): (JournalNoteData | JournalMetadata)[] {
    const startAnchorDate = this.#anchorDateResolver.resolveForDate(startDate);
    const endAnchorDate = this.#anchorDateResolver.resolveForDate(endDate);
    if (!startAnchorDate || !endAnchorDate) return [];
    const list = [];
    let current: string | null = startAnchorDate;
    while (current && current <= endAnchorDate) {
      const data = this.get(current);
      if (data) {
        list.push(data);
      }
      const next = this.next(current);
      current = next ? next.date : null;
    }

    return list;
  }

  async open(metadata: JournalMetadata, openMode?: OpenMode): Promise<void> {
    const file = await this.#ensureNote(metadata);
    if (!file) return;
    await this.#openFile(file, openMode);
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
    this.#addCommand(command);
  }

  updateCommand(index: number, command: JournalCommand): void {
    this.#removeCommand(this.config.value.commands[index]);
    this.config.value.commands[index] = command;
    this.#addCommand(command);
  }

  deleteCommand(index: number): void {
    const [command] = this.config.value.commands.splice(index, 1);
    this.#removeCommand(command);
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

  addCalendarViewRow(row: NavBlockRow): void {
    this.config.value.calendarViewBlock.rows.push(row);
  }

  editCalendarViewRow(index: number, row: NavBlockRow): void {
    this.config.value.calendarViewBlock.rows[index] = row;
  }

  deleteCalendarViewRow(index: number): void {
    this.config.value.calendarViewBlock.rows.splice(index, 1);
  }

  moveCalendarViewRowUp(index: number) {
    if (index > 0) {
      const temporary = this.config.value.calendarViewBlock.rows[index];
      this.config.value.calendarViewBlock.rows[index] = this.config.value.calendarViewBlock.rows[index - 1];
      this.config.value.calendarViewBlock.rows[index - 1] = temporary;
    }
  }
  moveCalendarViewRowDown(index: number) {
    if (index < this.config.value.calendarViewBlock.rows.length - 1) {
      const temporary = this.config.value.calendarViewBlock.rows[index];
      this.config.value.calendarViewBlock.rows[index] = this.config.value.calendarViewBlock.rows[index + 1];
      this.config.value.calendarViewBlock.rows[index + 1] = temporary;
    }
  }

  async clearNotes(): Promise<void> {
    const promises = [];
    const paths = this.index.getAllPaths(this.name);
    for (const path of paths) {
      promises.push(this.disconnectNote(path));
    }
    await Promise.allSettled(promises);
  }

  async deleteNotes(): Promise<void> {
    const promises = [];
    const paths = this.index.getAllPaths(this.name);
    for (const path of paths) {
      promises.push(this.notesManager.deleteNote(path));
    }
    await Promise.allSettled(promises);
  }

  async disconnectNote(path: string): Promise<void> {
    await this.notesManager.updateNoteFrontmatter(path, (frontmatter) => {
      delete frontmatter[FRONTMATTER_NAME_KEY];
      delete frontmatter[this.frontmatterDate];
      delete frontmatter[this.frontmatterStartDate];
      delete frontmatter[this.frontmatterEndDate];
      delete frontmatter[this.frontmatterIndex];
    });
  }

  async renameFrontmatterField<
    Field extends keyof JournalSettings["frontmatter"],
    Value extends JournalSettings["frontmatter"][Field],
  >(fieldName: Field, oldName: Value, newName: Value): Promise<void> {
    this.config.value.frontmatter[fieldName] = newName;
    const index = this.index.getJournalIndex(this.name);
    if (!index) return;
    for (const [, path] of index) {
      await this.notesManager.updateNoteFrontmatter(path, (frontmatter) => {
        frontmatter[newName as string] = frontmatter[oldName as string];
        delete frontmatter[oldName as string];
      });
    }
  }

  async toggleFrontmatterStartDate(): Promise<void> {
    this.config.value.frontmatter.addStartDate = !this.config.value.frontmatter.addStartDate;
    const index = this.index.getJournalIndex(this.name);
    if (!index) return;
    for (const [, path] of index) {
      await this.notesManager.updateNoteFrontmatter(path, (frontmatter) => {
        const anchorDate = this.resolveAnchorDate(frontmatter[this.frontmatterDate] as string);
        if (!anchorDate) return;
        if (this.config.value.frontmatter.addStartDate) {
          frontmatter[this.frontmatterStartDate] = this.resolveStartDate(anchorDate);
        } else {
          delete frontmatter[this.frontmatterStartDate];
        }
      });
    }
  }

  async toggleFrontmatterEndDate(): Promise<void> {
    this.config.value.frontmatter.addEndDate = !this.config.value.frontmatter.addEndDate;
    const index = this.index.getJournalIndex(this.name);
    if (!index) return;
    for (const [, path] of index) {
      await this.notesManager.updateNoteFrontmatter(path, (frontmatter) => {
        const anchorDate = this.resolveAnchorDate(frontmatter[this.frontmatterDate] as string);
        if (!anchorDate) return;
        const metadata = this.index.getForPath(path);
        if (this.config.value.frontmatter.addEndDate) {
          frontmatter[this.frontmatterEndDate] = metadata?.end_date ?? this.resolveEndDate(anchorDate);
        } else if (metadata?.end_date && frontmatter[this.frontmatterEndDate] === metadata.end_date) {
          delete frontmatter[this.frontmatterEndDate];
        }
      });
    }
  }

  async autoCreate() {
    if (!this.config.value.autoCreate) return;
    const metadata = this.get(today().format(FRONTMATTER_DATE_FORMAT));
    if (!metadata) return;
    await this.#ensureNote(metadata);
  }

  async #openFile(path: string, openMode: OpenMode = "active"): Promise<void> {
    await this.notesManager.openNote(path, openMode === "active" ? undefined : openMode);
  }

  async #ensureNote(metadata: JournalMetadata): Promise<string | null> {
    const filePath = this.getNotePath(metadata);
    if (!this.notesManager.nodeExists(filePath)) {
      const templateContext = this.#getTemplateContext(metadata);
      const noteName = replaceTemplateVariables(this.config.value.nameTemplate, templateContext);
      if (this.config.value.confirmCreation && !(await this.notesManager.confirmNoteCreation(this.name, noteName))) {
        return null;
      }
      await this.notesManager.createNote(filePath, "");
      templateContext.note_name = { type: "string", value: noteName };
      const content = await this.#getNoteContent(filePath, templateContext);
      if (content) await this.notesManager.updateNote(filePath, content);
    }
    await this.#ensureFrontMatter(filePath, metadata);
    return filePath;
  }

  getConfiguredPathData(metadata: JournalMetadata): [string, string] {
    const templateContext = this.#getTemplateContext(metadata);
    const filename = replaceTemplateVariables(this.config.value.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.config.value.folder, templateContext) || "/";
    return [folderPath, filename];
  }

  getResolvedTemplatePath(path: string, metadata: JournalMetadata): string {
    const templateContext = this.#getTemplateContext(metadata);
    return replaceTemplateVariables(path, templateContext);
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
      await this.disconnectNote(metadata.path);
    }
    let path = file.path;
    if (options.rename || options.move) {
      const [configuredFolder, configuredFilename] = this.getConfiguredPathData(metadata);
      const folderPath = options.move ? configuredFolder : file.parent?.path;
      const filename = options.rename ? configuredFilename : file.name;
      path = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
      await this.notesManager.renameNote(file.path, path);
    }

    await this.#ensureFrontMatter(path, metadata);
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

  async #getNoteContent(path: string, context: TemplateContext): Promise<string> {
    if (this.config.value.templates.length > 0) {
      for (const template of this.config.value.templates) {
        const templatePath = replaceTemplateVariables(template.endsWith(".md") ? template : template + ".md", context);
        const templateContent = await this.notesManager.getNoteContent(templatePath);
        if (templateContent) {
          return this.notesManager.tryApplyingTemplater(
            templatePath,
            path,
            replaceTemplateVariables(templateContent, context),
          );
        }
      }
    }
    return "";
  }
  async #ensureFrontMatter(path: string, metadata: JournalMetadata): Promise<void> {
    await this.notesManager.updateNoteFrontmatter(path, (frontmatter) => {
      frontmatter[FRONTMATTER_NAME_KEY] = this.name;
      frontmatter[this.frontmatterDate] = date_from_string(metadata.date).format(FRONTMATTER_DATE_FORMAT);
      if (metadata.end_date) {
        frontmatter[this.frontmatterEndDate] = date_from_string(metadata.end_date).format(FRONTMATTER_DATE_FORMAT);
      } else {
        delete frontmatter[this.frontmatterEndDate];
      }
      if (metadata.index == null) {
        delete frontmatter[this.frontmatterIndex];
      } else {
        frontmatter[this.frontmatterIndex] = metadata.index;
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

  #addCommand(command: JournalCommand) {
    this.appManager.addCommand(this.name, command, (checking) => {
      if (checking) {
        return this.#checkCommand(command);
      } else {
        this.#execCommand(command).catch(console.error);
      }
      return true;
    });
    if (command.showInRibbon) {
      this.appManager.addRibbonIcon(this.name, command.icon, command.name, () => {
        if (!this.#checkCommand(command)) return;
        this.#execCommand(command).catch(console.error);
      });
    }
  }

  #removeCommand(command: JournalCommand) {
    this.appManager.removeCommand(this.name, command);
    this.appManager.removeRibbonIcon(this.name, command.name);
  }

  #checkCommand(command: JournalCommand): boolean {
    if (command.context === "only_open_note") {
      const activeNote = this.activeNote.value;
      if (!activeNote) return false;
      const metadata = this.index.getForPath(activeNote);
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
    await this.open(metadata, command.openMode);
  }

  #getCommandRefDate(command: JournalCommand): string | null {
    const activeNote = this.activeNote.value;
    const metadata = activeNote ? this.index.getForPath(activeNote) : null;
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

  dispose() {
    for (const command of this.commands) {
      this.#removeCommand(command);
    }
  }
}
