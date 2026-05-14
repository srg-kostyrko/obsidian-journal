import * as v from "valibot";
import { reactive, watch, type WatchStopHandle } from "vue";

import { inject } from "@/infrastructure/di";
import { PluginData } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Logger } from "@/infrastructure/logger";
import { attempt, Err, type AsyncResult } from "@/infrastructure/result";

import { ReactiveCollection } from "./collection";
import {
  type MigrationFailedError,
  SettingsLoadError,
  SettingsSaveError,
  SliceKeyConflictError,
  UnregisteredSliceError,
} from "./errors";
import { runMigrations } from "./migrations";
import { CollectionDefinitionToken, MigrationToken, SliceDefinitionToken } from "./tokens";
import { CURRENT_VERSION } from "./version";

import type { AnyCollectionDefinition, AnySliceDefinition, CollectionDefinition, SliceDefinition } from "./schema";
import type { CollectionHandle, SliceHandle } from "./types";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

const DEBOUNCE_MS = 300;

export class SettingsService {
  readonly #pluginData = inject(PluginData);
  readonly #slices: readonly AnySliceDefinition[] = inject(SliceDefinitionToken);
  readonly #collections: readonly AnyCollectionDefinition[] = inject(CollectionDefinitionToken);
  readonly #migrations = inject(MigrationToken);
  readonly #logger = inject(LoggerFactoryToken).named("settings");

  readonly #root: Record<string, unknown> = reactive({});
  readonly #sliceKeys = new Set<string>();
  readonly #collectionHandles = new Map<string, ReactiveCollection<AnySchema>>();

  #stopWatch?: WatchStopHandle;
  #saveTimer: number | undefined;
  #initialized = false;

  initialize(): AsyncResult<void, SettingsLoadError | MigrationFailedError | SliceKeyConflictError> {
    return attempt.in(this, async function* () {
      const conflict = this.#findKeyConflict();
      if (conflict) yield* new Err<never, SliceKeyConflictError>(conflict);
      const raw = yield* this.#pluginData.load().mapErr((cause) => new SettingsLoadError(cause));
      const isStoredObject = raw !== null && typeof raw === "object" && !Array.isArray(raw);
      // Absent storage (no loadData payload yet) is a fresh install at the current version,
      // not a v0 record that needs migration. v0→N migrations only apply to actual stored data.
      const root: Record<string, unknown> = isStoredObject
        ? (raw as Record<string, unknown>)
        : { version: CURRENT_VERSION };
      const migrated = yield* runMigrations(root, this.#migrations, CURRENT_VERSION);
      this.#hydrate(migrated);
      this.#stopWatch = watch(this.#root, () => this.#scheduleSave(), { deep: true });
      this.#initialized = true;
    });
  }

  getSlice<TKey extends string, TSchema extends AnySchema>(
    slice: SliceDefinition<TKey, TSchema>,
  ): SliceHandle<InferOutput<TSchema>> {
    if (!this.#sliceKeys.has(slice.key)) throw new UnregisteredSliceError(slice.key);
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

  getCollection<TKey extends string, TItem extends AnySchema>(
    collection: CollectionDefinition<TKey, TItem>,
  ): CollectionHandle<InferOutput<TItem>> {
    const handle = this.#collectionHandles.get(collection.key);
    if (!handle) throw new UnregisteredSliceError(collection.key);
    return handle;
  }

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

  #hydrate(migrated: Record<string, unknown>): void {
    for (const definition of this.#slices) {
      this.#root[definition.key] = parseSliceValue(definition, migrated[definition.key], this.#logger);
      this.#sliceKeys.add(definition.key);
    }
    for (const definition of this.#collections) {
      this.#root[definition.key] = {};
      const entries = this.#root[definition.key] as Record<string, InferOutput<AnySchema>>;
      const handle = new ReactiveCollection(definition, entries, migrated[definition.key], this.#logger);
      this.#collectionHandles.set(definition.key, handle);
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

  [Symbol.dispose](): void {
    if (this.#saveTimer !== undefined) {
      window.clearTimeout(this.#saveTimer);
      this.#saveTimer = undefined;
    }
    this.#stopWatch?.();
    this.#stopWatch = undefined;
    this.#initialized = false;
  }

  async #flush(): Promise<void> {
    const out = JSON.parse(JSON.stringify({ ...this.#root, version: CURRENT_VERSION })) as Record<string, unknown>;
    const result = await this.#pluginData.save(out);
    if (result.kind === "err") {
      this.#logger.error("settings save failed", { error: new SettingsSaveError(result.error) });
    }
  }
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
