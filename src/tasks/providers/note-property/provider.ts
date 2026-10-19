import { watch } from "vue";

import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";
import { SettingsService } from "@/settings";

import { TaskHostToken, type TaskItem, type TaskProvider } from "../../types";

import { identifiesNote, readDates, readStatus, readTitle } from "./read";
import { NOTE_PROPERTY_PROVIDER_ID, notePropertySlice } from "./slice";
import NotePropertySettingsRow from "./ui/NotePropertySettingsRow.vue";
import { referencedProperties } from "./visibility";

export class NotePropertyTaskProvider implements TaskProvider {
  readonly #host = inject(TaskHostToken);
  readonly #notes = inject(NotesService);
  readonly #journals = inject(JournalsIndex);
  readonly #repository = inject(JournalsRepository);
  readonly #metadata = inject(NoteMetadataService);
  readonly #structure = inject(NoteStructureService);
  readonly #settings = inject(SettingsService).getSlice(notePropertySlice);
  #referenced: readonly string[] = [];
  readonly id = NOTE_PROPERTY_PROVIDER_ID;
  readonly settingsRow = NotePropertySettingsRow;

  #referencedNow(): readonly string[] {
    const rules = this.#repository.find().map((journal) => journal.tasks.providers[NOTE_PROPERTY_PROVIDER_ID]);
    return [...referencedProperties(rules)].toSorted();
  }

  #snapshot(properties: Record<string, unknown>): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const name of this.#referenced) {
      const value = properties[name];
      if (Object.hasOwn(properties, name) && value !== undefined) picked[name] = structuredClone(value);
    }
    return picked;
  }

  #itemsFor(path: VaultPath): readonly TaskItem[] {
    const state = this.#settings.state;
    if (!state.enabled) return [];
    const meta = this.#metadata.get(path);
    if (meta.isNone()) return [];
    const properties = meta.value.properties as Record<string, unknown>;
    const structure = this.#structure.get(path);
    const frontmatterTags = structure.isSome() ? structure.value.frontmatterTags : [];
    if (!identifiesNote({ frontmatterTags, properties }, path, state)) return [];
    return [
      {
        provider: this.id,
        key: `${this.id}:${path}`,
        path,
        status: readStatus(properties, state),
        relations: ["date"],
        capabilities: { movable: false, stampable: false, retargetable: true },
        display: { kind: "note", path, title: readTitle(properties, path, state.titleProperty) },
        dates: readDates(properties, state.dates),
        facts:
          this.#referenced.length === 0
            ? { frontmatterTags: [...frontmatterTags] }
            : { frontmatterTags: [...frontmatterTags], properties: this.#snapshot(properties) },
      },
    ];
  }

  #refresh(path: VaultPath): void {
    this.#host.publish(this.id, { path }, this.#itemsFor(path));
  }

  // One "all" publish: per-note publishing would bump the index version once per note.
  #refillAll(): void {
    const items = this.#notes.allMarkdownNotes().flatMap((path) => this.#itemsFor(path));
    this.#host.publish(this.id, "all", items);
  }

  start(): () => void {
    let disposed = false;
    this.#referenced = this.#referencedNow();
    // The registry starts before layout-ready, when the file list is partial and notes restored from
    // cached metadata emit no metadata-changed; index readiness is the signal that the walk is complete.
    if (this.#journals.isReady()) this.#refillAll();
    else {
      void this.#journals.whenReady().then(() => {
        if (!disposed) this.#refillAll();
      });
    }
    // Sync, so the write lands inside the same change the refill watch below reacts to, and the
    // first enable costs one walk and one version bump rather than two.
    const stopSetUpWatch = watch(
      () => this.#settings.state.enabled,
      (enabled) => {
        if (enabled && !this.#settings.state.setUp) this.#settings.state.setUp = true;
      },
      { immediate: true, flush: "sync" },
    );
    const stopSettingsWatch = watch(
      () => this.#settings.state,
      () => this.#refillAll(),
      { deep: true },
    );
    // Items snapshot only the properties some journal's rule names, so a rule naming a new one
    // leaves every item without it until the refill.
    const stopRulesWatch = watch(
      () => this.#referencedNow(),
      (names, previous) => {
        if (names.length === previous.length && names.every((name, at) => name === previous[at])) return;
        this.#referenced = names;
        this.#refillAll();
      },
    );
    // `created` is ignored: metadata does not exist yet, and metadata-changed follows with content.
    const stops = [
      this.#notes.events.on("metadata-changed", (path) => {
        this.#refresh(path);
      }),
      this.#notes.events.on("renamed", ({ from, to }) => {
        this.#host.publish(this.id, { path: from }, []);
        this.#refresh(to);
      }),
      this.#notes.events.on("deleted", (path) => {
        this.#host.publish(this.id, { path }, []);
      }),
    ];
    return () => {
      disposed = true;
      stopSetUpWatch();
      stopSettingsWatch();
      stopRulesWatch();
      for (const stop of stops) stop();
    };
  }
}
