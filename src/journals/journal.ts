import { computed, type ComputedRef } from "vue";
import { journals$ } from "../stores/settings.store";
import type { JournalCommand, JournalSettings } from "../types/settings.types";
import type { AnchorDateResolver, JournalAnchorDate, JournalMetadata, JournalNoteData } from "../types/journal.types";
import { activeNote$, app$, plugin$ } from "../stores/obsidian.store";
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
import type { MomentDate } from "@/types/date.types";
import { disconnectNote } from "@/utils/journals";

export class Journal {
  readonly name$: ComputedRef<string>;
  #config: ComputedRef<JournalSettings>;
  #anchorDateResolver: AnchorDateResolver;

  constructor(public readonly name: string) {
    this.#config = computed(() => journals$.value[name]);
    this.name$ = computed(() => this.#config.value.name);
    this.#anchorDateResolver = new FixedIntervalResolver(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      computed(() => this.#config.value.write),
    );
  }

  calculateOffset(date: MomentDate): [positive: number, negative: number] {
    return this.#anchorDateResolver.calculateOffset(date);
  }

  registerCommands(): void {
    for (const command of this.#config.value.commands) {
      plugin$.value.addCommand({
        id: this.name + ":" + command.name,
        name: `${this.#config.value.name}: ${command.name}`,
        icon: command.icon,
        checkCallback: (checking: boolean): boolean => {
          if (checking) {
            return this.#checkCommand(command);
          } else {
            this.#execCommand(command);
          }
          return true;
        },
      });
      if (command.showInRibbon) {
        const ribbonId = "journals:" + this.name + ":" + command.name;
        const item = (app$.value.workspace.leftRibbon as LeftRibbon).addRibbonItemButton(
          ribbonId,
          command.icon,
          command.name,
          () => {
            if (!this.#checkCommand(command)) return;
            this.#execCommand(command);
          },
        );
        plugin$.value.register(() => {
          (app$.value.workspace.leftRibbon as LeftRibbon).removeRibbonAction(ribbonId);
          item.detach();
        });
      }
    }
  }

  async find(date: string): Promise<JournalNoteData | JournalMetadata | null> {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    const metadata = plugin$.value.index.find(this.name, anchorDate);
    if (metadata) return metadata;
    if (!this.#checkBounds(anchorDate)) return null;
    return await this.#buildMetadata(anchorDate);
  }

  async next(date: string, existing = false): Promise<JournalNoteData | JournalMetadata | null> {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    if (existing) {
      const nextExstingMetadata = plugin$.value.index.findNext(this.name, anchorDate);
      if (nextExstingMetadata) return nextExstingMetadata;
    }
    const nextAnchorDate = this.#anchorDateResolver.resolveNext(anchorDate);
    if (!nextAnchorDate) return null;
    const nextMetadata = plugin$.value.index.find(this.name, nextAnchorDate);
    if (nextMetadata) return nextMetadata;
    if (!this.#checkBounds(nextAnchorDate)) return null;
    return await this.#buildMetadata(nextAnchorDate);
  }

  async previous(date: string, existing = false): Promise<JournalNoteData | JournalMetadata | null> {
    const anchorDate = this.#anchorDateResolver.resolveForDate(date);
    if (!anchorDate) return null;
    if (existing) {
      const previousExstingMetadata = plugin$.value.index.findPrevious(this.name, anchorDate);
      if (previousExstingMetadata) return previousExstingMetadata;
    }
    const prevAnchorDate = this.#anchorDateResolver.resolvePrevious(anchorDate);
    if (!prevAnchorDate) return null;
    const previousMetadata = plugin$.value.index.find(this.name, prevAnchorDate);
    if (previousMetadata) return previousMetadata;
    if (!this.#checkBounds(prevAnchorDate)) return null;
    return await this.#buildMetadata(prevAnchorDate);
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

  async #openFile(file: TFile): Promise<void> {
    const mode = this.#config.value.openMode === "active" ? undefined : this.#config.value.openMode;
    const leaf = app$.value.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  async #ensureNote(metadata: JournalMetadata): Promise<TFile | null> {
    const filePath = this.getNotePath(metadata);
    let file = app$.value.vault.getAbstractFileByPath(filePath);
    if (!file) {
      const templateContext = this.#getTemplateContext(metadata);
      const noteName = replaceTemplateVariables(this.#config.value.nameTemplate, templateContext);
      if (this.#config.value.confirmCreation && !(await this.#confirmNoteCreation(noteName))) {
        return null;
      }
      await ensureFolderExists(app$.value, filePath);
      file = await app$.value.vault.create(filePath, "");
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");

      templateContext.note_name = { type: "string", value: noteName };
      const content = await this.#getNoteContent(file, templateContext);
      if (content) await app$.value.vault.modify(file, content);
    }
    if (!(file instanceof TFile)) throw new Error("File is not a TFile");
    await this.#ensureFrontMatter(file, metadata);
    return file;
  }

  #confirmNoteCreation(noteName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new VueModal(
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
    const filename = replaceTemplateVariables(this.#config.value.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.#config.value.folder, templateContext) || "/";
    return [folderPath, filename];
  }

  getNotePath(metadata: JournalNoteData | JournalMetadata): string {
    if ("path" in metadata) return metadata.path;
    const templateContext = this.#getTemplateContext(metadata);
    const filename = replaceTemplateVariables(this.#config.value.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.#config.value.folder, templateContext);
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
    const metadata = await this.find(anchorDate);
    if (!metadata) return false;
    if ("path" in metadata) {
      if (!options.override) return false;
      await disconnectNote(metadata.path);
    }
    let path = file.path;
    if (options.rename || options.move) {
      const [configuredFolder, configuredFilename] = this.getConfiguredPathData(metadata);
      const folderPath = options.move ? configuredFolder : file.parent?.path;
      const filename = options.rename ? configuredFilename : file.name;
      path = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
      await ensureFolderExists(app$.value, path);
      await app$.value.vault.rename(file, path);
      file = app$.value.vault.getAbstractFileByPath(path) as TFile;
    }

    await this.#ensureFrontMatter(file, metadata);
    return true;
  }

  #getTemplateContext(metadata: JournalMetadata): TemplateContext {
    return {
      date: {
        type: "date",
        value: metadata.date,
        defaultFormat: this.#config.value.dateFormat,
      },
      start_date: {
        type: "date",
        value: this.#anchorDateResolver.resolveStartDate(metadata.date),
        defaultFormat: this.#config.value.dateFormat,
      },
      end_date: {
        type: "date",
        value: metadata.end_date ?? this.#anchorDateResolver.resolveEndDate(metadata.date),
        defaultFormat: this.#config.value.dateFormat,
      },
      journal_name: {
        type: "string",
        value: this.#config.value.name,
      },
      index: {
        type: "number",
        value: metadata.index,
      },
    };
  }

  async #getNoteContent(note: TFile, context: TemplateContext): Promise<string> {
    if (this.#config.value.templates.length > 0) {
      for (const template of this.#config.value.templates) {
        const path = replaceTemplateVariables(template.endsWith(".md") ? template : template + ".md", context);
        const templateFile = app$.value.vault.getAbstractFileByPath(path);
        if (templateFile instanceof TFile) {
          const templateContent = await app$.value.vault.cachedRead(templateFile);
          return tryApplyingTemplater(
            app$.value,
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
    await app$.value.fileManager.processFrontMatter(note, (frontmatter) => {
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

  async #buildMetadata(anchorDate: JournalAnchorDate): Promise<JournalMetadata> {
    const metadata: JournalMetadata = {
      journal: this.name,
      date: anchorDate,
      index: await this.#resolveIndex(anchorDate),
    };
    return metadata;
  }

  #checkCommand(command: JournalCommand): boolean {
    if (command.context === "only_open_note") {
      const activeNode = activeNote$.value;
      if (!activeNode) return false;
      const metadata = plugin$.value.index.getForPath(activeNode.path);
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
    const metadata = await this.find(date);
    if (!metadata) return;
    this.open(metadata);
  }

  #getCommandRefDate(command: JournalCommand): string | null {
    const activeNode = activeNote$.value;
    const metadata = activeNode ? plugin$.value.index.getForPath(activeNode.path) : null;
    if (metadata && command.context !== "today") {
      return metadata.date;
    }
    if (command.context === "only_open_note") return null;
    return today().format(FRONTMATTER_DATE_FORMAT);
  }

  #checkBounds(anchorDate: JournalAnchorDate): boolean {
    if (this.#config.value.start) {
      const startDate = date_from_string(this.#config.value.start);
      if (startDate.isValid() && date_from_string(anchorDate).isBefore(startDate)) return false;
    }

    if (this.#config.value.end.type === "date" && this.#config.value.end.date) {
      const endDate = date_from_string(this.#config.value.end.date);
      if (endDate.isValid() && date_from_string(anchorDate).isAfter(endDate)) return false;
    }
    if (this.#config.value.end.type === "repeats" && this.#config.value.end.repeats && this.#config.value.start) {
      const repeats = this.#anchorDateResolver.countRepeats(this.#config.value.start, anchorDate);
      if (repeats > this.#config.value.end.repeats) return false;
    }

    return true;
  }

  async #resolveIndex(anchorDate: JournalAnchorDate): Promise<number | undefined> {
    if (!this.#config.value.index.enabled) return undefined;
    if (!this.#config.value.index.anchorDate || !this.#config.value.index.anchorIndex) return undefined;
    const before = await this.previous(anchorDate, true);
    if (before && before.index) {
      const repeats = this.#anchorDateResolver.countRepeats(before.date, anchorDate);
      let index = before.index + repeats;
      if (this.#config.value.index.type === "reset_after") {
        index %= this.#config.value.index.resetAfter;
      }
      return index;
    }
    const after = await this.next(anchorDate, true);
    if (after && after.index) {
      const repeats = this.#anchorDateResolver.countRepeats(anchorDate, after.date);
      let index = after.index - repeats;
      if (this.#config.value.index.type === "reset_after" && index < 0) {
        index *= -1;
      }
      return index;
    }
    const anchor = date_from_string(this.#config.value.index.anchorDate);
    if (!anchor.isValid()) return undefined;
    if (
      anchor.isAfter(anchorDate) &&
      this.#config.value.index.type === "increment" &&
      !this.#config.value.index.allowBefore
    )
      return undefined;
    if (anchor.isBefore(anchorDate)) {
      const repeats = this.#anchorDateResolver.countRepeats(this.#config.value.index.anchorDate, anchorDate);
      let index = this.#config.value.index.anchorIndex + repeats;
      if (this.#config.value.index.type === "reset_after") {
        index %= this.#config.value.index.resetAfter;
      }
      return index;
    }
    const repeats = this.#anchorDateResolver.countRepeats(anchorDate, this.#config.value.index.anchorDate);
    let index = this.#config.value.index.anchorIndex - repeats;
    if (this.#config.value.index.type === "reset_after" && index < 0) {
      index *= -1;
    }
    return index;
  }
}
