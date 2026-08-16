import * as v from "valibot";
import { reactive, watch, type WatchStopHandle } from "vue";

import { inject } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Logger } from "@/infrastructure/logger";
import { attempt, Err, type AsyncResult } from "@/infrastructure/result";

import {
  type MigrationFailedError,
  SettingsLoadError,
  SettingsSaveError,
  SliceKeyConflictError,
  UnregisteredSliceError,
} from "./errors";
import { runMigrations } from "./migrations";
import { SnapshotService } from "./snapshots/snapshot-service";
import { CollectionDefinitionToken, MigrationToken, SettingsEventsToken, SliceDefinitionToken } from "./tokens";
import { CURRENT_VERSION } from "./version";

import type { AnyCollectionDefinition, AnySliceDefinition, CollectionDefinition, SliceDefinition } from "./schema";
import type { SliceHandle } from "./types";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

const DEBOUNCE_MS = 300;

export class SettingsService {
  readonly #pluginData = inject(PluginData);
  readonly #snapshots = inject(SnapshotService);
  readonly #slices: readonly AnySliceDefinition[] = inject(SliceDefinitionToken);
  readonly #collections: readonly AnyCollectionDefinition[] = inject(CollectionDefinitionToken);
  readonly #migrations = inject(MigrationToken);
  readonly #events = inject(SettingsEventsToken);
  readonly #logger = inject(LoggerFactoryToken).named("settings");

  readonly #root: Record<string, unknown> = reactive({});
  readonly #registeredSliceKeys = new Set<string>(this.#slices.map((s) => s.key));
  readonly #registeredCollectionKeys = new Set<string>(this.#collections.map((c) => c.key));

  #stopWatch?: WatchStopHandle;
  #saveTimer: number | undefined;
  #initialized = false;

  #findKeyConflict(): SliceKeyConflictError | undefined {
    const seen = new Set<string>();
    for (const s of this.#slices) {
      if (seen.has(s.key)) return new SliceKeyConflictError(s.key);
      seen.add(s.key);
    }
    for (const c of this.#collections) {
      if (seen.has(c.key)) return new SliceKeyConflictError(c.key);
      seen.add(c.key);
    }
    return undefined;
  }

  #loadAndMigrate(): AsyncResult<Record<string, unknown>, SettingsLoadError | MigrationFailedError> {
    return attempt.in(this, async function* () {
      const raw = yield* this.#pluginData.load().mapErr((cause) => new SettingsLoadError(cause));
      const isStoredObject = raw !== null && typeof raw === "object" && !Array.isArray(raw);
      // Absent storage (no loadData payload yet) is a fresh install at the current version,
      // not a v0 record that needs migration. v0→N migrations only apply to actual stored data.
      const root: Record<string, unknown> = isStoredObject
        ? (raw as Record<string, unknown>)
        : { version: CURRENT_VERSION };
      if (isStoredObject) await this.#snapshotIfBehind(root);
      return yield* runMigrations(root, this.#migrations, CURRENT_VERSION);
    });
  }

  // A migration is the only event that can still lose a whole config, so it is the only one
  // that snapshots — one per version transition (see the spec's "Rolling backups" non-goal).
  // initialize() never flushes the migrated result back to disk, so an unchanged data.json
  // re-enters this on every subsequent boot; listing first and skipping a version already
  // snapshotted is what keeps that to one file. A snapshot that cannot be written, or a list
  // that cannot be read, must not stop the plugin loading — migrating unprotected beats
  // refusing to start.
  async #snapshotIfBehind(root: Record<string, unknown>): Promise<void> {
    const storedVersion = typeof root.version === "number" ? root.version : 0;
    if (storedVersion >= CURRENT_VERSION) return;
    const existing = await this.#snapshots.list();
    const alreadyTaken = existing.match({
      ok: (snapshots) => snapshots.some((snapshot) => snapshot.fromVersion === storedVersion),
      err: () => false,
    });
    if (alreadyTaken) return;
    const written = await this.#snapshots.write(storedVersion, JSON.stringify(root), new Date().toISOString());
    written.tapErr((error) => {
      this.#logger.warn("could not snapshot settings before migrating", { storedVersion, error });
    });
  }

  #hydrate(migrated: Record<string, unknown>): void {
    for (const definition of this.#slices) {
      this.#root[definition.key] = parseSliceValue(definition, migrated[definition.key], this.#logger);
    }
    for (const definition of this.#collections) {
      this.#root[definition.key] = parseCollectionValue(definition, migrated[definition.key], this.#logger);
    }
  }

  #refresh(migrated: Record<string, unknown>): void {
    for (const definition of this.#slices) {
      this.#root[definition.key] = parseSliceValue(definition, migrated[definition.key], this.#logger);
    }
    for (const definition of this.#collections) {
      const next = parseCollectionValue(definition, migrated[definition.key], this.#logger);
      // recordOf() hands the collection record out by reference and repositories capture it
      // once, so the existing object must be mutated in place rather than replaced.
      const target = this.#root[definition.key] as Record<string, unknown>;
      for (const key of Object.keys(target)) {
        if (!Object.hasOwn(next, key)) delete target[key];
      }
      Object.assign(target, next);
    }
  }

  #scheduleSave(): void {
    if (!this.#initialized) return;
    if (this.#saveTimer !== undefined) window.clearTimeout(this.#saveTimer);
    this.#saveTimer = window.setTimeout(() => {
      this.#saveTimer = undefined;
      void this.#flush();
    }, DEBOUNCE_MS);
  }

  async #flush(): Promise<void> {
    const out = JSON.parse(JSON.stringify({ ...this.#root, version: CURRENT_VERSION })) as Record<string, unknown>;
    const result = await this.#pluginData.save(out);
    if (result.kind === "err") {
      this.#logger.error("settings save failed", { error: new SettingsSaveError(result.error) });
    }
  }

  // Suspends the save watcher across the refresh so applying externally-sourced data does
  // not echo a save back to disk, then re-arms it and signals event-driven subsystems
  // (command registry, journal index) that only re-derive on an explicit "reloaded". Must
  // run only after every fallible step has succeeded — reload() and replaceStoredData()
  // both stay safe-by-construction that way: an Err short-circuits before the watcher is
  // ever touched, so a failed load or save never leaves it permanently stopped.
  #applyMigrated(migrated: Record<string, unknown>): void {
    this.#stopWatch?.();
    this.#events.emit("reloading");
    this.#refresh(migrated);
    this.#stopWatch = watch(this.#root, () => this.#scheduleSave(), { deep: true });
    this.#events.emit("reloaded");
  }

  initialize(): AsyncResult<void, SettingsLoadError | MigrationFailedError | SliceKeyConflictError> {
    return attempt.in(this, async function* () {
      const conflict = this.#findKeyConflict();
      if (conflict) yield* new Err<never, SliceKeyConflictError>(conflict);
      const migrated = yield* this.#loadAndMigrate();
      this.#hydrate(migrated);
      this.#stopWatch = watch(this.#root, () => this.#scheduleSave(), { deep: true });
      this.#initialized = true;
    });
  }

  // Obsidian Sync rewrites data.json on disk without touching our in-memory state; this
  // re-reads it and refreshes #root so synced changes are picked up without a plugin reload.
  reload(): AsyncResult<void, SettingsLoadError | MigrationFailedError> {
    return attempt.in(this, async function* () {
      if (!this.#initialized) return;
      const migrated = yield* this.#loadAndMigrate();
      if (this.#saveTimer !== undefined) {
        window.clearTimeout(this.#saveTimer);
        this.#saveTimer = undefined;
      }
      this.#applyMigrated(migrated);
    });
  }

  // Restoring a snapshot. The pending flush must be cancelled before the write, not after:
  // a debounce scheduled from an edit made just beforehand would otherwise fire between the
  // save and the re-hydrate and put the replaced state straight back.
  //
  // Whether the payload can migrate is checked before data.json is touched. A payload runMigrations rejects —
  // a snapshot written by a newer plugin version and restored after a downgrade, or a
  // hand-edited file that is still valid JSON — must not overwrite the working file: the
  // in-memory state would be the only remaining copy until a later save, and quitting before
  // that leaves the next boot hitting MigrationFailedError with no plugin and no Maintenance
  // page to recover from.
  replaceStoredData(
    raw: Record<string, unknown>,
  ): AsyncResult<void, SettingsLoadError | MigrationFailedError | SettingsSaveError> {
    return attempt.in(this, async function* () {
      if (!this.#initialized) return;
      if (this.#saveTimer !== undefined) {
        window.clearTimeout(this.#saveTimer);
        this.#saveTimer = undefined;
      }
      yield* runMigrations(raw, this.#migrations, CURRENT_VERSION);
      yield* this.#pluginData.save(raw).mapErr((cause) => new SettingsSaveError(cause));
      const migrated = yield* this.#loadAndMigrate();
      this.#applyMigrated(migrated);
    });
  }

  getSlice<TKey extends string, TSchema extends AnySchema>(
    slice: SliceDefinition<TKey, TSchema>,
  ): SliceHandle<InferOutput<TSchema>> {
    if (!this.#registeredSliceKeys.has(slice.key)) throw new UnregisteredSliceError(slice.key);
    const root = this.#root;
    return {
      get state(): InferOutput<TSchema> {
        return root[slice.key];
      },
      set state(value: InferOutput<TSchema>) {
        root[slice.key] = value;
      },
    };
  }

  recordOf<TKey extends string, TItem extends AnySchema>(
    collection: CollectionDefinition<TKey, TItem>,
  ): Record<string, InferOutput<TItem>> {
    if (!this.#registeredCollectionKeys.has(collection.key)) {
      throw new UnregisteredSliceError(collection.key);
    }
    return this.#root[collection.key] as Record<string, InferOutput<TItem>>;
  }

  [Symbol.dispose](): void {
    if (this.#saveTimer !== undefined) {
      window.clearTimeout(this.#saveTimer);
      this.#saveTimer = undefined;
    }
    this.#stopWatch?.();
    this.#stopWatch = undefined;
    this.#initialized = false;
  }
}

function parseCollectionValue<TItem extends AnySchema>(
  definition: CollectionDefinition<string, TItem>,
  raw: unknown,
  logger: Logger,
): Record<string, InferOutput<TItem>> {
  const out: Record<string, InferOutput<TItem>> = {};
  if (raw === undefined && definition.seed) {
    for (const [id, value] of Object.entries(definition.seed())) {
      const parsed = v.safeParse(definition.itemSchema, value);
      if (parsed.success) {
        out[id] = parsed.output;
      } else {
        logger.warn("collection seed entry failed validation; omitting", {
          sliceKey: `${definition.key}/${id}`,
          issues: parsed.issues.map((issue) => issue.message),
        });
      }
    }
    return out;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    const parsed = v.safeParse(definition.itemSchema, value);
    if (parsed.success) {
      out[id] = parsed.output;
    } else {
      out[id] = definition.defaultItem(id);
      logger.warn("collection entry reset to defaults", {
        sliceKey: `${definition.key}/${id}`,
        issues: parsed.issues.map((issue) => issue.message),
      });
    }
  }
  return out;
}

function parseSliceValue<TSchema extends AnySchema>(
  definition: SliceDefinition<string, TSchema>,
  raw: unknown,
  logger: Logger,
): InferOutput<TSchema> {
  const parsed = v.safeParse(definition.schema, raw);
  if (parsed.success) return parsed.output;
  logger.warn("slice reset to defaults", {
    sliceKey: definition.key,
    issues: parsed.issues.map((issue) => issue.message),
  });
  return structuredClone(definition.defaults);
}
