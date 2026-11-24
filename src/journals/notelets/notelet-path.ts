import { normalizePath } from "obsidian";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NotesService, type VaultPath } from "@/infrastructure/host";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { TemplateEngine, type TemplateContext } from "@/templates";

import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { EmptyNoteNameError, JournalDateFormatError } from "../notes/errors";
import { NotePathService, withNoteName, type NotePathError } from "../notes/note-path";
import { renderBindingFor } from "../prompts/prompt-binding";

import type { JournalConfig } from "../config";
import type { JournalNotFoundError } from "../errors";
import type { JournalMetadata, NoteletMetadata } from "../types";
import type { NoteletType } from "./config";

export class NoteletPathService {
  readonly #paths = inject(NotePathService);
  readonly #frontmatter = inject(FrontmatterService);
  readonly #index = inject(JournalsIndex);
  readonly #engine = inject(TemplateEngine);
  readonly #notes = inject(NotesService);

  // The rendered note name feeds back into the folder as {{note_name}}/{{title}}, so a suffixed
  // name has to re-render the folder rather than being appended to a finished path.
  #pathFrom(
    config: JournalConfig,
    type: NoteletType,
    context: TemplateContext,
    noteName: string,
  ): Result<VaultPath, JournalDateFormatError> {
    const folder = type.folder
      ? this.#render(config, type.folder, withNoteName(context, noteName))
      : new Ok<string, JournalDateFormatError>("");
    return folder.map(
      (rendered) => normalizePath(rendered ? `${rendered}/${noteName}.md` : `${noteName}.md`) as VaultPath,
    );
  }

  #render(config: JournalConfig, template: string, context: TemplateContext): Result<string, JournalDateFormatError> {
    return this.#engine
      .renderString(template, context)
      .mapErr((error) => JournalDateFormatError.from(config.name, error));
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
  ): Result<string, EmptyNoteNameError | JournalDateFormatError> {
    return this.#render(config, type.nameTemplate, context).flatMap((name) =>
      name.trim() === "" ? new Err(new EmptyNoteNameError(config.name)) : new Ok(name),
    );
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

  nameFor(config: JournalConfig, type: NoteletType, metadata: NoteletMetadata): Result<string, NotePathError> {
    return this.contextFor(config, type, metadata).flatMap((context) => this.#renderedName(config, type, context));
  }

  /**
   * Where this type's templates say the notelet goes, with no suffixing.
   *
   * `availablePathFor` steps past a taken path because it is about to create a file there.
   * Connect and bulk add only compare — a suffix would describe a name they will not write.
   */
  pathFor(config: JournalConfig, type: NoteletType, metadata: NoteletMetadata): Result<VaultPath, NotePathError> {
    return this.#frontmatter.buildMetadata(config.name, metadata.anchor).flatMap((period) => {
      const context = this.#contextFromPeriod(config, type, metadata, period);
      return this.#renderedName(config, type, context).flatMap((name) => this.#pathFrom(config, type, context, name));
    });
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
  ): Result<VaultPath, NotePathError> {
    return this.#frontmatter.buildMetadata(config.name, metadata.anchor).flatMap((period) => {
      const context = this.#contextFromPeriod(config, type, metadata, period);
      return this.#renderedName(config, type, context).flatMap((base) => {
        const reservedResult = this.#paths.pathFor(config.name, period);
        const reserved = reservedResult.isOk() ? reservedResult.value : undefined;
        const taken = (candidate: VaultPath): boolean => candidate === reserved || this.#notes.find(candidate).isSome();

        let candidate = this.#pathFrom(config, type, context, base);
        for (let suffix = 1; candidate.isOk() && taken(candidate.value); suffix++) {
          candidate = this.#pathFrom(config, type, context, `${base} ${suffix}`);
        }
        return candidate;
      });
    });
  }
}
