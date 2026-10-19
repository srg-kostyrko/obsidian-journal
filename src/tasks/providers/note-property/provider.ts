import { watch } from "vue";

import { inject } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { TaskHostToken, type TaskItem, type TaskProvider } from "../../types";

import { identifiesNote, readDates, readStatus, readTitle } from "./read";
import { NOTE_PROPERTY_PROVIDER_ID, notePropertySlice } from "./slice";

export class NotePropertyTaskProvider implements TaskProvider {
  readonly #host = inject(TaskHostToken);
  readonly #notes = inject(NotesService);
  readonly #metadata = inject(NoteMetadataService);
  readonly #settings = inject(SettingsService).getSlice(notePropertySlice);
  readonly id = NOTE_PROPERTY_PROVIDER_ID;

  #itemsFor(path: VaultPath): readonly TaskItem[] {
    const state = this.#settings.state;
    if (!state.enabled) return [];
    const meta = this.#metadata.get(path);
    if (meta.isNone() || !identifiesNote(meta.value, path, state)) return [];
    const properties = meta.value.properties as Record<string, unknown>;
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
    // Safe as a whole-vault walk: the registry starts providers after the journals index is ready,
    // which already waited for layout-ready and for every note to resolve in metadataCache.
    this.#refillAll();
    const stopSettingsWatch = watch(
      () => this.#settings.state,
      () => this.#refillAll(),
      { deep: true },
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
      stopSettingsWatch();
      for (const stop of stops) stop();
    };
  }
}
