import * as v from "valibot";
import { computed, reactive, readonly, ref, watch, type WatchStopHandle } from "vue";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { NoticeService, PluginData } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Logger } from "@/infrastructure/logger";
import { attempt, Err, type AsyncResult } from "@/infrastructure/result";

import {
  type MigrationFailedError,
  SettingsLoadError,
  SettingsSaveError,
  SettingsTooNewError,
  SliceKeyConflictError,
  UnregisteredSliceError,
} from "./errors";
import { runMigrations } from "./migrations";
import { SnapshotService } from "./snapshots/snapshot-service";
import { CollectionDefinitionToken, MigrationToken, SettingsEventsToken, SliceDefinitionToken } from "./tokens";
import { CURRENT_VERSION } from "./version";

import type {
  AnyCollectionDefinition,
  AnyNestedCollectionDefinition,
  AnySliceDefinition,
  CollectionDefinition,
  SliceDefinition,
} from "./schema";
import type { SliceHandle } from "./types";
import type { BaseIssue, BaseSchema, InferOutput } from "valibot";

type AnySchema = BaseSchema<unknown, unknown, BaseIssue<unknown>>;

const DEBOUNCE_MS = 300;
const PRE_RESTORE_KEEP = 3;
const PRE_IMPORT_KEEP = 3;
const PRE_DOWNGRADE_KEEP = 3;

// Which event is reading data.json. Behind-version data means different things across the three:
// an ordinary upgrade at boot, the payload the user chose on a restore, and — only on a refresh —
// an older build on another device having overwritten settings this one still holds in memory.
type LoadPhase = "boot" | "refresh" | "restore";

export class SettingsService {
  readonly #pluginData = inject(PluginData);
  readonly #notices = inject(NoticeService);
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

  // Session-scoped, like ReloadHintService's hint: settings newer than this build stay newer
  // until Obsidian restarts with a build that understands them, and a restart clears it by
  // construction. Holding the error rather than a flag keeps the versions available to callers
  // that have to report the refusal.
  readonly #tooNew = ref<SettingsTooNewError | undefined>(undefined);

  // What data.json held at the last load, to tell a file an older build overwrote from the same
  // file we already migrated forward in memory. initialize() never writes the migrated result
  // back, so behind-version data on a refresh is the *expected* state after an upgrade — only a
  // change to those bytes makes it a downgrade.
  #lastLoadedRaw: string | undefined;

  readonly lockedByNewerVersion = readonly(computed(() => this.#tooNew.value !== undefined));

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

  #loadAndMigrate(
    phase: LoadPhase,
  ): AsyncResult<Record<string, unknown>, SettingsLoadError | MigrationFailedError | SettingsTooNewError> {
    return attempt.in(this, async function* () {
      const raw = yield* this.#pluginData.load().mapErr((cause) => new SettingsLoadError(cause));
      const isStoredObject = raw !== null && typeof raw === "object" && !Array.isArray(raw);
      // Absent storage (no loadData payload yet) is a fresh install at the current version,
      // not a v0 record that needs migration. v0→N migrations only apply to actual stored data.
      const root: Record<string, unknown> = isStoredObject
        ? (raw as Record<string, unknown>)
        : { version: CURRENT_VERSION };
      const serialized = JSON.stringify(root);
      const changedOnDisk = serialized !== this.#lastLoadedRaw;
      this.#lastLoadedRaw = serialized;
      if (isStoredObject) await this.#snapshotIfBehind(root, phase, changedOnDisk);
      return yield* runMigrations(root, this.#migrations, CURRENT_VERSION).tapErr((error) => {
        if (error instanceof SettingsTooNewError) this.#tooNew.value = error;
      });
    });
  }

  // A migration is the only event that can still lose a whole config, so it is the only one
  // that snapshots — one per version transition (see the spec's "Rolling backups" non-goal).
  // initialize() never flushes the migrated result back to disk, so an unchanged data.json
  // re-enters this on every subsequent boot; listing first and skipping a version already
  // snapshotted is what keeps that to one file. A snapshot that cannot be written, or a list
  // that cannot be read, must not stop the plugin loading — migrating unprotected beats
  // refusing to start.
  async #snapshotIfBehind(root: Record<string, unknown>, phase: LoadPhase, changedOnDisk: boolean): Promise<void> {
    const storedVersion = typeof root.version === "number" ? root.version : 0;
    if (storedVersion >= CURRENT_VERSION) return;
    if (phase === "refresh" && changedOnDisk) return this.#snapshotBeforeDowngrade();
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

  // An older build on another device has saved its shape over ours. Unlike every other snapshot
  // the payload worth keeping is not the file — that one is the overwrite, and it migrates forward
  // on its own — but the settings this device still holds in memory, which are about to be
  // replaced by it and exist nowhere else. The notice is withheld when nothing was written: it
  // promises a backup the user could restore.
  async #snapshotBeforeDowngrade(): Promise<void> {
    const contents = JSON.stringify({ ...this.#root, version: CURRENT_VERSION });
    const written = await this.#snapshots.writePreDowngrade(CURRENT_VERSION, contents, new Date().toISOString());
    if (written.kind === "err") {
      this.#logger.warn("could not snapshot the settings an older version replaced", { error: written.error });
      return;
    }
    const pruned = await this.#snapshots.prune("pre-downgrade", PRE_DOWNGRADE_KEEP);
    pruned.tapErr((error) => {
      this.#logger.warn("could not prune pre-downgrade snapshots", { error });
    });
    this.#notices.show(m.settings_replaced_by_older());
  }

  // Restore and import are the two events that rewrite a whole configuration at the user's click,
  // with no undo. Keep the last few of each, and never let a failed snapshot block the action the
  // user asked for.
  async #snapshotCurrent(reason: "pre-restore" | "pre-import"): Promise<boolean> {
    const doing = reason === "pre-restore" ? "restoring" : "importing";
    // A save debounced from an edit made just before this call has not reached data.json yet;
    // flush it first so the snapshot (and, for a restore, the file this overwrites) is not
    // missing that edit.
    if (this.#saveTimer !== undefined) {
      window.clearTimeout(this.#saveTimer);
      this.#saveTimer = undefined;
      await this.#flush();
    }
    const current = await this.#pluginData.load();
    if (current.kind === "err") {
      this.#logger.warn(`could not read current settings before ${doing}`, { error: current.error });
      return false;
    }
    const raw = current.value;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
    const stored = raw as Record<string, unknown>;
    const fromVersion = typeof stored.version === "number" ? stored.version : 0;
    const contents = JSON.stringify(stored);
    const takenAt = new Date().toISOString();
    const written =
      reason === "pre-restore"
        ? await this.#snapshots.writePreRestore(fromVersion, contents, takenAt)
        : await this.#snapshots.writePreImport(fromVersion, contents, takenAt);
    if (written.kind === "err") {
      this.#logger.warn(`could not snapshot settings before ${doing}`, { error: written.error });
      return false;
    }
    const pruned = await this.#snapshots.prune(reason, reason === "pre-restore" ? PRE_RESTORE_KEEP : PRE_IMPORT_KEEP);
    pruned.tapErr((error) => {
      this.#logger.warn(`could not prune ${reason} snapshots`, { error });
    });
    return true;
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

  // The last gate before the overwrite #466 describes, and the only one that holds when the host
  // never reports the external change: data.json is re-read here rather than trusted from the last
  // load, because a sync client can replace it without Obsidian calling onExternalSettingsChange.
  // A read that fails says nothing about the version, and refusing every save on it would be a
  // worse failure than the overwrite it guards against — so only a version it could actually read
  // latches the refusal.
  async #refuseSaveWhenTooNew(): Promise<boolean> {
    if (this.#tooNew.value === undefined) {
      const stored = await this.#pluginData.load();
      if (stored.kind === "ok") {
        const version = versionOf(stored.value);
        if (version > CURRENT_VERSION) this.#tooNew.value = new SettingsTooNewError(version, CURRENT_VERSION);
      }
    }
    if (this.#tooNew.value === undefined) return false;
    this.#notices.show(m.settings_too_new_notice());
    return true;
  }

  async #flush(): Promise<void> {
    if (await this.#refuseSaveWhenTooNew()) return;
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

  /** Snapshots the stored settings before an import writes to them; false when none was written. */
  snapshotBeforeImport(): Promise<boolean> {
    if (this.#tooNew.value !== undefined) return Promise.resolve(false);
    return this.#snapshotCurrent("pre-import");
  }

  initialize(): AsyncResult<
    void,
    SettingsLoadError | MigrationFailedError | SettingsTooNewError | SliceKeyConflictError
  > {
    return attempt.in(this, async function* () {
      const conflict = this.#findKeyConflict();
      if (conflict) yield* new Err<never, SliceKeyConflictError>(conflict);
      const migrated = yield* this.#loadAndMigrate("boot");
      this.#hydrate(migrated);
      this.#stopWatch = watch(this.#root, () => this.#scheduleSave(), { deep: true });
      this.#initialized = true;
    });
  }

  // Obsidian Sync rewrites data.json on disk without touching our in-memory state; this
  // re-reads it and refreshes #root so synced changes are picked up without a plugin reload.
  reload(): AsyncResult<void, SettingsLoadError | MigrationFailedError | SettingsTooNewError> {
    return attempt.in(this, async function* () {
      if (!this.#initialized) return;
      const migrated = yield* this.#loadAndMigrate("refresh");
      if (this.#saveTimer !== undefined) {
        window.clearTimeout(this.#saveTimer);
        this.#saveTimer = undefined;
      }
      this.#applyMigrated(migrated);
    });
  }

  // Restoring a snapshot. No debounced save may fire between the write below and the re-hydrate,
  // or it would put the replaced state straight back — but the timer must not simply be cancelled
  // here, or a change made just beforehand would be missing from the pre-restore snapshot too.
  // #snapshotCurrent's own flush (below) clears it and writes the pending edit to disk before this
  // reaches save(), so nothing here needs to touch it; if runMigrations short-circuits first, the
  // pending save was never touched and simply fires as normal.
  //
  // Whether the payload can migrate is checked before data.json is touched. A payload runMigrations rejects —
  // a snapshot written by a newer plugin version and restored after a downgrade, or a
  // hand-edited file that is still valid JSON — must not overwrite the working file: the
  // in-memory state would be the only remaining copy until a later save, and quitting before
  // that leaves the next boot hitting MigrationFailedError with no plugin and no Maintenance
  // page to recover from.
  replaceStoredData(
    raw: Record<string, unknown>,
  ): AsyncResult<void, SettingsLoadError | MigrationFailedError | SettingsTooNewError | SettingsSaveError> {
    return attempt.in(this, async function* () {
      if (!this.#initialized) return;
      // A restore is a second door onto the same data.json, so the session lock bars it too —
      // writing an older snapshot over settings a newer build saved is the very overwrite the
      // lock exists to stop, just with the user's finger on it.
      const tooNew = this.#tooNew.value;
      if (tooNew !== undefined) yield* new Err<never, SettingsTooNewError>(tooNew);
      // Migrations mutate their input in place, so validating against `raw` itself would
      // corrupt it before it reaches save() below — validate a disposable clone instead.
      // A payload this rejects as too new is a rejected input, not a report about disk, so it
      // must not reach the latch: runMigrations is called here directly rather than through
      // #loadAndMigrate for exactly that reason.
      yield* runMigrations(structuredClone(raw), this.#migrations, CURRENT_VERSION);
      await this.#snapshotCurrent("pre-restore");
      yield* this.#pluginData.save(raw).mapErr((cause) => new SettingsSaveError(cause));
      const migrated = yield* this.#loadAndMigrate("restore");
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

function versionOf(raw: unknown): number {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const version = (raw as Record<string, unknown>).version;
  return typeof version === "number" ? version : 0;
}

function describeShape(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return "array";
  return typeof raw;
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
  // Absence is the fresh-install case and must stay silent; a stored value of the wrong shape is
  // a corrupted file, and discarding it silently costs the user every entry with no diagnostic.
  if (raw === undefined) return out;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    logger.warn("collection discarded; stored value is not an object", {
      sliceKey: definition.key,
      stored: describeShape(raw),
    });
    return out;
  }
  for (const [id, value] of Object.entries(raw)) {
    const parsed = v.safeParse(definition.itemSchema, value);
    if (parsed.success) {
      out[id] = parsed.output;
      continue;
    }

    const issues = parsed.issues.map((issue) => issue.message);
    const repaired = repairCollectionEntry(definition, id, value, parsed.issues);
    if (repaired) {
      out[id] = repaired.value;
      logger.warn("collection entry fields reset to defaults", {
        sliceKey: `${definition.key}/${id}`,
        fields: repaired.fields,
        issues,
      });
      continue;
    }

    out[id] = definition.defaultItem(id, value);
    logger.warn("collection entry reset to defaults", { sliceKey: `${definition.key}/${id}`, issues });
  }
  return out;
}

// Resetting a whole entity because one field went bad silently discards everything the
// user configured — and the next save writes that loss over their data. Substitute the
// default only for the fields the issues name, so a broken date format costs a date
// format rather than the journal's write type, folder and templates.
function repairCollectionEntry<TItem extends AnySchema>(
  definition: CollectionDefinition<string, TItem>,
  id: string,
  value: unknown,
  issues: readonly BaseIssue<unknown>[],
): { value: InferOutput<TItem>; fields: string[] } | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;

  // `definition.nested` is keyed on the item schema's own field names (see CollectionNested in
  // schema.ts) so authors get a compile error for a stray key; that key set is generic here, so
  // widen to look it up by the runtime string an issue path actually names.
  const nestedMap = definition.nested as Readonly<Record<string, AnyNestedCollectionDefinition>> | undefined;

  const plain = new Set<string>();
  // A list field whose failures all sit on individual items keeps the items that still read: a
  // question of a type a newer version added would otherwise wipe every question beside it.
  const droppedItems = new Map<string, Set<number>>();
  const nested = new Map<string, { definition: AnyNestedCollectionDefinition; issues: BaseIssue<unknown>[] }>();
  for (const issue of issues) {
    // A root-level check reports no path, so there is no field to swap out.
    const key = issue.path?.[0]?.key;
    if (typeof key !== "string") return undefined;
    const nestedDefinition = nestedMap?.[key];
    if (nestedDefinition !== undefined) {
      const existing = nested.get(key);
      if (existing) existing.issues.push(issue);
      else nested.set(key, { definition: nestedDefinition, issues: [issue] });
      continue;
    }
    const index = issue.path?.[1]?.key;
    if (typeof index === "number" && Array.isArray((value as Record<string, unknown>)[key])) {
      const indexes = droppedItems.get(key) ?? new Set<number>();
      indexes.add(index);
      droppedItems.set(key, indexes);
      continue;
    }
    plain.add(key);
  }
  for (const field of plain) droppedItems.delete(field);
  if (plain.size === 0 && nested.size === 0 && droppedItems.size === 0) return undefined;

  const defaults = definition.defaultItem(id, value) as Record<string, unknown>;
  const candidate: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  const fields: string[] = [];
  const partiallyRepaired = new Set<string>();
  for (const field of plain) {
    candidate[field] = defaults[field];
    fields.push(field);
  }
  for (const [field, indexes] of droppedItems) {
    candidate[field] = (candidate[field] as unknown[]).filter((_, index) => !indexes.has(index));
    fields.push(...[...indexes].map((index) => `${field}.${index}`));
    partiallyRepaired.add(field);
  }
  for (const [field, entry] of nested) {
    const repaired = repairNestedCollection(entry.definition, candidate[field], entry.issues);
    if (repaired === undefined) {
      candidate[field] = defaults[field];
      fields.push(field);
      continue;
    }
    candidate[field] = repaired.value;
    fields.push(...repaired.fields.map((nestedField) => `${field}.${nestedField}`));
    partiallyRepaired.add(field);
  }

  const parsed = v.safeParse(definition.itemSchema, candidate);
  if (parsed.success) return { value: parsed.output, fields };
  if (partiallyRepaired.size === 0) return undefined;

  // A repair that only touched one entry inside a nested field, or only dropped a few items out
  // of a list field, can still fail a check spanning the whole item (a nested default colliding
  // with a sibling field, or a list that is still invalid once the dropped items are gone, say).
  // Retry with the old whole-field reset for every field either mechanism touched, and only give
  // up if that also fails — never widen the loss past what the pre-nested-repair code discarded.
  for (const field of partiallyRepaired) candidate[field] = defaults[field];
  const retryFields = [...plain, ...nested.keys(), ...droppedItems.keys()];
  const retried = v.safeParse(definition.itemSchema, candidate);
  return retried.success ? { value: retried.output, fields: retryFields } : undefined;
}

function repairNestedCollection(
  definition: AnyNestedCollectionDefinition,
  container: unknown,
  issues: readonly BaseIssue<unknown>[],
): { value: Record<string, unknown>; fields: string[] } | undefined {
  if (container === null || typeof container !== "object" || Array.isArray(container)) return undefined;

  const byEntry = new Map<string, BaseIssue<unknown>[]>();
  for (const issue of issues) {
    // An issue on the container itself names no entry, so there is nothing to repair inside it.
    const entryId = issue.path?.[1]?.key;
    if (typeof entryId !== "string") return undefined;
    const existing = byEntry.get(entryId);
    if (existing) existing.push(issue);
    else byEntry.set(entryId, [issue]);
  }

  const out: Record<string, unknown> = { ...(container as Record<string, unknown>) };
  const fields: string[] = [];
  for (const [entryId, entryIssues] of byEntry) {
    const entryValue = out[entryId];
    const repaired = repairNestedEntry(definition, entryId, entryValue, entryIssues);
    if (repaired === undefined) {
      const fallback = definition.defaultItem(entryId, entryValue);
      // defaultItem's contract only promises it keeps what still parses, not that its result
      // does — a lenient default here would silently escalate this per-entry reset into the
      // whole-field reset the caller falls back to, so verify before writing it into the container.
      if (!v.safeParse(definition.itemSchema, fallback).success) return undefined;
      out[entryId] = fallback;
      fields.push(entryId);
      continue;
    }
    out[entryId] = repaired.value;
    fields.push(...repaired.fields.map((field) => `${entryId}.${field}`));
  }
  return { value: out, fields };
}

function repairNestedEntry(
  definition: AnyNestedCollectionDefinition,
  entryId: string,
  value: unknown,
  issues: readonly BaseIssue<unknown>[],
): { value: unknown; fields: string[] } | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;

  const fields = new Set<string>();
  const droppedItems = new Map<string, Set<number>>();
  for (const issue of issues) {
    const key = issue.path?.[2]?.key;
    if (typeof key !== "string") return undefined;
    const index = issue.path?.[3]?.key;
    if (typeof index === "number" && Array.isArray((value as Record<string, unknown>)[key])) {
      const indexes = droppedItems.get(key) ?? new Set<number>();
      indexes.add(index);
      droppedItems.set(key, indexes);
      continue;
    }
    fields.add(key);
  }
  for (const field of fields) droppedItems.delete(field);
  if (fields.size === 0 && droppedItems.size === 0) return undefined;

  const defaults = definition.defaultItem(entryId, value) as Record<string, unknown>;
  const candidate: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const field of fields) candidate[field] = defaults[field];

  // Store the pre-parse candidate, not parsed.output: repairNestedCollection's caller re-parses
  // the whole item, so returning the already-transformed output would run any v.transform in
  // the entry schema twice for a repaired entry while its untouched siblings run it once.
  const dropped: Record<string, unknown> = { ...candidate };
  for (const [field, indexes] of droppedItems) {
    dropped[field] = (dropped[field] as unknown[]).filter((_, index) => !indexes.has(index));
  }
  if (v.safeParse(definition.itemSchema, dropped).success) {
    const droppedFields = [...droppedItems].flatMap(([field, indexes]) =>
      [...indexes].map((index) => `${field}.${index}`),
    );
    return { value: dropped, fields: [...fields, ...droppedFields] };
  }

  for (const field of droppedItems.keys()) candidate[field] = defaults[field];
  const parsed = v.safeParse(definition.itemSchema, candidate);
  return parsed.success ? { value: candidate, fields: [...fields, ...droppedItems.keys()] } : undefined;
}

function parseSliceValue<TSchema extends AnySchema>(
  definition: SliceDefinition<string, TSchema>,
  raw: unknown,
  logger: Logger,
): InferOutput<TSchema> {
  // Absence is the fresh-install case and must stay silent, mirroring parseCollectionValue's
  // carve-out above; a stored value of the wrong shape still falls through to the warning below.
  if (raw === undefined) return structuredClone(definition.defaults);
  const parsed = v.safeParse(definition.schema, raw);
  if (parsed.success) return parsed.output;
  logger.warn("slice reset to defaults", {
    sliceKey: definition.key,
    issues: parsed.issues.map((issue) => issue.message),
  });
  return structuredClone(definition.defaults);
}
