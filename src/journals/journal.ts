import { computed, type ComputedRef } from "vue";
import { journals$ } from "../stores/settings.store";
import type { JournalCommand, JournalSettings } from "../types/settings.types";
import type { IntervalResolver, JournalInterval, JournalMetadata } from "../types/journal.types";
import { activeNote$, app$, plugin$ } from "../stores/obsidian.store";
import { normalizePath, TFile, moment, type LeftRibbon } from "obsidian";
import { ensureFolderExists } from "../utils/io";
import { replaceTemplateVariables, tryApplyingTemplater } from "../utils/template";
import type { TemplateContext } from "../types/template.types";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";
import { FixedInterval } from "./fixed-interval";
import { date, today } from "../calendar";

export class Journal {
  #config: ComputedRef<JournalSettings>;
  #intervalResolver: IntervalResolver;

  constructor(public readonly id: string) {
    this.#config = computed(() => journals$.value[id]);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    this.#intervalResolver = new FixedInterval(() => this.#config.value.write);
  }

  registerCommands(): void {
    for (const command of this.#config.value.commands) {
      plugin$.value.addCommand({
        id: this.id + ":" + command.name,
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
        const ribbonId = "journals:" + this.id + ":" + command.name;
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

  async find(date: string): Promise<JournalMetadata | null> {
    const metadata = plugin$.value.index.find(this.id, date);
    if (metadata) return metadata;
    const interval = this.#intervalResolver.resolveForDate(date);
    if (!interval) return null;
    if (!this.#checkBounds(interval)) return null;
    return await this.#buildMetadata(interval);
  }

  async next(metadata: JournalInterval, existing = false): Promise<JournalMetadata | null> {
    if (existing) {
      const nextExstingMetadata = plugin$.value.index.findNext(this.id, metadata);
      if (nextExstingMetadata) return nextExstingMetadata;
    }
    const interval = this.#intervalResolver.resolveNext(metadata.end_date);
    if (!interval) return null;
    const nextMetadata = plugin$.value.index.find(this.id, interval.start_date);
    if (nextMetadata) return nextMetadata;
    if (!this.#checkBounds(interval)) return null;
    return await this.#buildMetadata(interval);
  }

  async previous(metadata: JournalInterval, existing = false): Promise<JournalMetadata | null> {
    if (existing) {
      const previousExstingMetadata = plugin$.value.index.findPrevious(this.id, metadata);
      if (previousExstingMetadata) return previousExstingMetadata;
    }
    const interval = this.#intervalResolver.resolvePrevious(metadata.end_date);
    if (!interval) return null;
    const previousMetadata = plugin$.value.index.find(this.id, interval.end_date);
    if (previousMetadata) return previousMetadata;
    if (!this.#checkBounds(interval)) return null;
    return await this.#buildMetadata(interval);
  }

  async open(metadata: JournalMetadata): Promise<void> {
    const file = await this.#ensureNote(metadata);
    await this.#openFile(file);
  }

  async #openFile(file: TFile): Promise<void> {
    const mode = this.#config.value.openMode === "active" ? undefined : this.#config.value.openMode;
    const leaf = app$.value.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  async #ensureNote(metadata: JournalMetadata): Promise<TFile> {
    const filePath = this.#getNotePath(metadata);
    let file = app$.value.vault.getAbstractFileByPath(filePath);
    if (!file) {
      await ensureFolderExists(app$.value, filePath);
      file = await app$.value.vault.create(filePath, "");
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");
      const templateContext = this.#getTemplateContext(metadata);
      const noteName = replaceTemplateVariables(this.#config.value.nameTemplate, templateContext);
      templateContext.note_name = { type: "string", value: noteName };
      const content = await this.#getNoteContent(file, templateContext);
      if (content) await app$.value.vault.modify(file, content);
    }
    if (!(file instanceof TFile)) throw new Error("File is not a TFile");
    await this.#ensureFrontMatter(file, metadata);
    return file;
  }

  #getNotePath(metadata: JournalMetadata): string {
    if (metadata.path) return metadata.path;
    const templateContext = this.#getTemplateContext(metadata);
    const filename = replaceTemplateVariables(this.#config.value.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.#config.value.folder, templateContext);
    return normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
  }

  #getTemplateContext(metadata: JournalMetadata): TemplateContext {
    return {
      date: {
        type: "date",
        value: metadata.start_date,
        defaultFormat: this.#config.value.dateFormat,
      },
      start_date: {
        type: "date",
        value: metadata.start_date,
        defaultFormat: this.#config.value.dateFormat,
      },
      end_date: {
        type: "date",
        value: metadata.end_date,
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
      frontmatter[FRONTMATTER_ID_KEY] = this.id;
      frontmatter[FRONTMATTER_START_DATE_KEY] = moment(metadata.start_date).format(FRONTMATTER_DATE_FORMAT);
      frontmatter[FRONTMATTER_END_DATE_KEY] = moment(metadata.end_date).format(FRONTMATTER_DATE_FORMAT);
      if (metadata.index == null) {
        delete frontmatter[FRONTMATTER_INDEX_KEY];
      } else {
        frontmatter[FRONTMATTER_INDEX_KEY] = metadata.index;
      }
    });
  }

  async #buildMetadata(interval: JournalInterval): Promise<JournalMetadata> {
    const metadata: JournalMetadata = {
      id: this.id,
      start_date: interval.start_date,
      end_date: interval.start_date,
      index: await this.#resolveIndex(interval),
    };
    return metadata;
  }

  #checkCommand(command: JournalCommand): boolean {
    if (command.context === "only_open_note") {
      const activeNode = activeNote$.value;
      if (!activeNode) return false;
      const metadata = plugin$.value.index.getForPath(activeNode.path);
      if (!metadata) return false;
      if (metadata.id !== this.id) return false;
    }
    return true;
  }

  async #execCommand(command: JournalCommand): Promise<void> {
    const refDate = this.#getCommandRefDate(command);
    if (!refDate) return;
    const date = this.#intervalResolver.resolveDateForCommand(refDate, command.type);
    if (!date) return;
    const metadata = await this.find(date);
    if (!metadata) return;
    this.open(metadata);
  }

  #getCommandRefDate(command: JournalCommand): string | null {
    const activeNode = activeNote$.value;
    const metadata = activeNode ? plugin$.value.index.getForPath(activeNode.path) : null;
    if (metadata && command.context !== "today") {
      return metadata.end_date;
    }
    if (command.context === "only_open_note") return null;
    return today().format(FRONTMATTER_DATE_FORMAT);
  }

  #checkBounds(interval: JournalInterval): boolean {
    if (this.#config.value.start) {
      const startDate = date(this.#config.value.start);
      if (startDate.isValid() && date(interval.end_date).isBefore(startDate)) return false;
    }

    if (this.#config.value.end.type === "date" && this.#config.value.end.date) {
      const endDate = date(this.#config.value.end.date);
      if (endDate.isValid() && date(interval.start_date).isAfter(endDate)) return false;
    }
    if (this.#config.value.end.type === "repeats" && this.#config.value.end.repeats && this.#config.value.start) {
      const repeats = this.#intervalResolver.countRepeats(this.#config.value.start, interval.start_date);
      if (repeats > this.#config.value.end.repeats) return false;
    }

    return true;
  }

  async #resolveIndex(interval: JournalInterval): Promise<number | undefined> {
    if (!this.#config.value.index.enabled) return undefined;
    if (!this.#config.value.index.anchorDate || !this.#config.value.index.anchorIndex) return undefined;
    const before = await this.previous(interval, true);
    if (before && before.index) {
      const repeats = this.#intervalResolver.countRepeats(before.end_date, interval.start_date);
      let index = before.index + repeats;
      if (this.#config.value.index.type === "reset_after") {
        index %= this.#config.value.index.resetAfter;
      }
      return index;
    }
    const after = await this.next(interval, true);
    if (after && after.index) {
      const repeats = this.#intervalResolver.countRepeats(interval.end_date, after.start_date);
      let index = after.index - repeats;
      if (this.#config.value.index.type === "reset_after" && index < 0) {
        index *= -1;
      }
      return index;
    }
    const anchor = date(this.#config.value.index.anchorDate);
    if (!anchor.isValid()) return undefined;
    if (
      anchor.isAfter(interval.start_date) &&
      this.#config.value.index.type === "increment" &&
      !this.#config.value.index.allowBefore
    )
      return undefined;
    if (anchor.isBefore(interval.start_date)) {
      const repeats = this.#intervalResolver.countRepeats(this.#config.value.index.anchorDate, interval.start_date);
      let index = this.#config.value.index.anchorIndex + repeats;
      if (this.#config.value.index.type === "reset_after") {
        index %= this.#config.value.index.resetAfter;
      }
      return index;
    }
    const repeats = this.#intervalResolver.countRepeats(interval.end_date, this.#config.value.index.anchorDate);
    let index = this.#config.value.index.anchorIndex - repeats;
    if (this.#config.value.index.type === "reset_after" && index < 0) {
      index *= -1;
    }
    return index;
  }
}
