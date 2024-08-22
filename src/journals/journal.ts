import { computed, type ComputedRef } from "vue";
import { journals$ } from "../stores/settings.store";
import type { JournalSettings } from "../types/settings.types";
import type { IntervalResolver, JournalInterval, JournalMetadata } from "../types/journal.types";
import { app$ } from "../stores/obsidian.store";
import { normalizePath, TFile, moment } from "obsidian";
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

export class Journal {
  #config: ComputedRef<JournalSettings>;
  #intervalResolver: IntervalResolver;

  constructor(public readonly id: string) {
    this.#config = computed(() => journals$.value[id]);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    this.#intervalResolver = new FixedInterval(() => this.#config.value.write);
  }

  async find(date: string): Promise<JournalMetadata | null> {
    const interval = this.#intervalResolver.resolveForDate(date);
    if (!interval) return null;
    return await this.#buildMetadata(interval);
  }

  async next(metadata: JournalMetadata, _existing = false): Promise<JournalMetadata | null> {
    // TODO: process existing
    const interval = this.#intervalResolver.resolveNext(metadata.end_date);
    if (!interval) return null;
    return await this.#buildMetadata(interval);
  }

  async previous(metadata: JournalMetadata, _existing = false): Promise<JournalMetadata | null> {
    // TODO: process existing
    const interval = this.#intervalResolver.resolvePrevious(metadata.end_date);
    if (!interval) return null;
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
    };
    return metadata;
  }
}
