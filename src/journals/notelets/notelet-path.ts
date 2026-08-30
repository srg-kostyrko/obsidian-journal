import { normalizePath } from "obsidian";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { TemplateEngine, type TemplateContext } from "@/templates";

import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { EmptyNoteNameError } from "../notes/errors";
import { NotePathService, withNoteName } from "../notes/note-path";
import { renderBindingFor } from "../prompts/prompt-binding";

import type { NoteletType } from "./config";
import type { JournalConfig } from "../config";
import type { JournalNotFoundError } from "../errors";
import type { JournalMetadata, NoteletMetadata } from "../types";

export class NoteletPathService {
  readonly #paths = inject(NotePathService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #engine = inject(TemplateEngine);
  readonly #notes = inject(NotesService);

  // The rendered note name feeds back into the folder as {{note_name}}/{{title}}, so a suffixed
  // name has to re-render the folder rather than being appended to a finished path.
  #pathFrom(type: NoteletType, context: TemplateContext, noteName: string): VaultPath {
    const folder = type.folder ? this.#engine.renderString(type.folder, withNoteName(context, noteName)) : "";
    return normalizePath(folder ? `${folder}/${noteName}.md` : `${noteName}.md`) as VaultPath;
  }

  #contextFromPeriod(
    config: JournalConfig,
    type: NoteletType,
    metadata: NoteletMetadata,
    period: JournalMetadata,
  ): TemplateContext {
    let context = this.#paths.periodContextFor(config, period);
    // The journal's own prompt answers are deliberately absent: they live only on the period
    // note, so binding them would make one type render different names depending on whether a
    // period note happened to exist yet. The variable name is still declared, empty, so a
    // template referencing it renders blank rather than leaking the literal `{{token}}`.
    for (const prompt of config.prompts) {
      context = context.string(prompt.variable, "");
    }
    for (const prompt of type.prompts) {
      const { spec } = renderBindingFor(prompt, metadata.answers?.[prompt.variable]);
      context = context.withSpec(prompt.variable, spec);
    }
    const counter = metadata.counter ?? this.nextIndex(config.name, metadata.anchor, type.name);
    return context.number("notelet_index", counter);
  }

  // A note named "" becomes the dotfile ".md", which is invisible in the vault. Shared by
  // nameFor and availablePathFor so there is one rendering rule, not two.
  #renderedName(
    config: JournalConfig,
    type: NoteletType,
    context: TemplateContext,
  ): Result<string, EmptyNoteNameError> {
    const name = this.#engine.renderString(type.nameTemplate, context);
    return name.trim() === "" ? new Err(new EmptyNoteNameError(config.name)) : new Ok(name);
  }

  /**
   * The next counter for this type in this period: the highest stored one plus one.
   *
   * Scoped per (journal, anchor, type), so it restarts each period. Deleting the last notelet of
   * a period reuses its number — highest+1 is the only rule available with no high-water mark.
   */
  nextIndex(journalName: string, anchor: AnchorString, typeName: string): number {
    let highest = 0;
    for (const entry of this.#index.noteletsAt(journalName, anchor)) {
      if (entry.typeName !== typeName) continue;
      if (entry.counter !== undefined && entry.counter > highest) highest = entry.counter;
    }
    return highest + 1;
  }

  contextFor(
    config: JournalConfig,
    type: NoteletType,
    metadata: NoteletMetadata,
  ): Result<TemplateContext, JournalNotFoundError> {
    return this.#frontmatter
      .buildMetadata(config.name, metadata.anchor)
      .map((period) => this.#contextFromPeriod(config, type, metadata, period));
  }

  nameFor(
    config: JournalConfig,
    type: NoteletType,
    metadata: NoteletMetadata,
  ): Result<string, JournalNotFoundError | EmptyNoteNameError> {
    return this.contextFor(config, type, metadata).flatMap((context) => this.#renderedName(config, type, context));
  }

  bodyContextFor(
    config: JournalConfig,
    type: NoteletType,
    metadata: NoteletMetadata,
    noteName: string,
  ): Result<TemplateContext, JournalNotFoundError> {
    return this.contextFor(config, type, metadata).map((context) => {
      let out = withNoteName(context, noteName);
      // The placeholder is a file-name device; in prose it would be an unrepairable token.
      for (const prompt of type.prompts) {
        const { answered } = renderBindingFor(prompt, metadata.answers?.[prompt.variable]);
        if (!answered) out = out.string(prompt.variable, "");
      }
      return out;
    });
  }

  /**
   * Where this notelet goes, suffixed past anything already at that path.
   *
   * The taken set includes the journal's own derived period-note path for this anchor, reserved
   * whether or not a file is there: the period note usually does not exist yet, so an existence
   * check would let the collision form and only bite later — when `ensureNote` would read the
   * notelet's own journal claim and adopt it as the period note.
   */
  availablePathFor(
    config: JournalConfig,
    type: NoteletType,
    metadata: NoteletMetadata,
  ): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> {
    return this.#frontmatter.buildMetadata(config.name, metadata.anchor).flatMap((period) => {
      const context = this.#contextFromPeriod(config, type, metadata, period);
      return this.#renderedName(config, type, context).flatMap((base) => {
        const reservedResult = this.#paths.pathFor(config.name, period);
        const reserved = reservedResult.isOk() ? reservedResult.value : undefined;
        const taken = (candidate: VaultPath): boolean => candidate === reserved || this.#notes.find(candidate).isSome();

        let candidate = this.#pathFrom(type, context, base);
        for (let suffix = 1; taken(candidate); suffix++) {
          candidate = this.#pathFrom(type, context, `${base} ${suffix}`);
        }
        return new Ok(candidate);
      });
    });
  }
}
