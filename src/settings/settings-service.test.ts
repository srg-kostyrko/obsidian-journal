import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { createToken, type Module } from "@/infrastructure/di";
import { PluginDataIOError } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { journalConfigCollection } from "@/journals/config";
import { testContainer } from "@/testing";

import { SliceKeyConflictError, MigrationFailedError, SettingsSaveError, UnregisteredSliceError } from "./errors";
import { v4ToV5Migration } from "./legacy/v4-to-v5";
import {
  defineCollection,
  defineSlice,
  type AnyCollectionDefinition,
  type AnySliceDefinition,
  type Migration,
} from "./schema";
import { SettingsService } from "./settings-service";
import { SnapshotService } from "./snapshots/snapshot-service";
import { CollectionDefinitionToken, MigrationToken, SettingsEventsToken, SliceDefinitionToken } from "./tokens";
import { CURRENT_VERSION } from "./version";

const calendarSchema = v.object({
  dow: v.number(),
  global: v.boolean(),
});

const calendarSlice = defineSlice("calendar", calendarSchema, { dow: 1, global: true });

const journalSchema = v.object({ name: v.string() });
const journalCollection = defineCollection("journals", journalSchema, (id) => ({ name: id }));

const petSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  kind: v.picklist(["cat", "dog"]),
  sound: v.pipe(v.string(), v.minLength(1)),
  toys: v.optional(v.array(v.string()), []),
});

const sounds = { cat: "meow", dog: "woof" } as const;

function storedKind(raw: unknown): "cat" | "dog" {
  return (raw as { kind?: unknown } | null)?.kind === "dog" ? "dog" : "cat";
}

const petDefaults = (id: string, raw: unknown): v.InferOutput<typeof petSchema> => ({
  name: id,
  kind: storedKind(raw),
  sound: sounds[storedKind(raw)],
  toys: [],
});

const petCollection = defineCollection("pets", petSchema, petDefaults);

const checkedPetCollection = defineCollection(
  "pets",
  v.pipe(
    petSchema,
    v.check((pet) => pet.name !== pet.sound, "name and sound must differ"),
  ),
  petDefaults,
);

// Supplies this file's synthetic slice/collection/migration definitions to testContainer's
// `modules`. A bare testContainer() registers zero slices and zero collections, so these
// deliberately shadow-named keys (`calendar`, `journals`, `pets`) collide with nothing real.
function testSettingsModule(
  options: {
    slices?: readonly AnySliceDefinition[];
    collections?: readonly AnyCollectionDefinition[];
    migrations?: readonly Migration[];
  } = {},
): Module {
  return {
    register(c) {
      const slices = options.slices ?? [calendarSlice];
      for (const slice of slices) {
        c.register(SliceDefinitionToken).useValue(slice);
      }
      const collections = options.collections ?? [journalCollection];
      for (const collection of collections) {
        c.register(CollectionDefinitionToken).useValue(collection);
      }
      const migrations = options.migrations ?? [];
      for (const migration of migrations) {
        c.register(MigrationToken).useValue(migration);
      }
    },
  };
}

// testContainer resolves and initializes its own SettingsService before it ever returns, so
// harness.settings cannot express "before initialize". This registers a second SettingsService
// under a distinct token, sharing the harness's container (and so the same PluginData, slices
// and collections) but never initialized. It must be paired with a non-empty collection: #refresh
// only assigns slices directly, but reads a collection's existing #root entry before writing it
// (`Object.keys(target)`), so a registered collection is what makes an un-guarded reload()/
// replaceStoredData() throw on this un-hydrated instance instead of silently doing nothing —
// with zero collections registered the guard's absence is invisible.
const secondSettingsServiceToken = createToken<SettingsService>("test.settings.second");

function secondSettingsServiceModule(): Module {
  return {
    register(c) {
      c.register(secondSettingsServiceToken).useClass(SettingsService);
    },
  };
}

describe("SettingsService", () => {
  describe("initialize — happy path", () => {
    it("hydrates a slice from a stored root", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 0, global: false } },
      });
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(0);
      expect(harness.settings.getSlice(calendarSlice).state.global).toBe(false);
    });

    it("starts a fresh install with defaults when no data exists", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()] });
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(1);
    });

    it("treats a missing root version as 0 and runs migrations up to current", async () => {
      const bumpToCurrent: Migration = {
        fromVersion: 0,
        toVersion: 5,
        migrate: (r) => ({ ...r, calendar: { dow: 5, global: true } }),
      };
      const harness = await testContainer({
        modules: [testSettingsModule({ migrations: [bumpToCurrent] })],
        data: { version: 0, calendar: { dow: 0, global: false } },
      });
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(5);
    });
  });

  describe("initialize — slice validation fallback", () => {
    it("falls back to defaults when a stored slice fails validation", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: "not-a-number" } },
        allow: { dataRepair: true },
      });
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(1);
    });
  });

  // These fixtures are already at CURRENT_VERSION and register no migration: a stored version
  // below it would fail runMigrations, and initialize would return Err before hydrating — which
  // surfaces as an undefined collection record rather than a migration error. Hence expectOk.
  describe("initialize — collection entry repair", () => {
    it("keeps the fields that validate and repairs only the ones that do not", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [petCollection] })],
        data: { pets: { Rex: { name: "Rex", kind: "dog", sound: "", toys: ["ball"] } } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(petCollection).Rex).toEqual({
        name: "Rex",
        kind: "dog",
        sound: "woof",
        toys: ["ball"],
      });
    });

    // "keeps the fields that validate..." above tells the whole-reset and field-substitution paths
    // apart; sound derives only from kind, so this pins just that the stored kind reaches defaultItem.
    it("passes the stored kind through to the collection's defaultItem", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [petCollection] })],
        data: { pets: { Rex: { name: "Rex", kind: "dog", sound: "" } } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(petCollection).Rex.sound).toBe("woof");
    });

    it("falls back to the whole default when the entry is not an object", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [petCollection] })],
        data: { pets: { Rex: "not an entry" } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(petCollection).Rex).toEqual({
        name: "Rex",
        kind: "cat",
        sound: "meow",
        toys: [],
      });
    });

    it("falls back to the whole default when the failure names no field", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [checkedPetCollection] })],
        data: { pets: { Rex: { name: "woof", kind: "dog", sound: "woof", toys: ["ball"] } } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(checkedPetCollection).Rex).toEqual({
        name: "Rex",
        kind: "dog",
        sound: "woof",
        toys: [],
      });
    });
  });

  // A v2 vault whose journals cleared the date format loaded every journal as a *day*
  // journal named after the original, so the calendar offered five daily journals on a
  // day click and week, month, quarter and year went inert.
  describe("initialize — a journal keeps its kind when one field fails", () => {
    const weekly = {
      name: "Journal weekly",
      write: { type: "week" },
      timeline: { start: "", end: { kind: "never" } },
      dateFormat: "",
      frontmatter: {
        dateField: "journal-date",
        startDateField: "journal-start-date",
        endDateField: "journal-end-date",
        addStartDate: true,
        addEndDate: true,
      },
      numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
      nameTemplate: "{{date:YYYY-[W]ww}}",
      folder: "02 - Journal/Weekly",
      templates: ["99 - Meta/Templates/Weekly Note Template.md"],
    };

    it("stays a weekly journal", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [journalConfigCollection] })],
        data: { journals: { "Journal weekly": weekly } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(journalConfigCollection)["Journal weekly"].write).toEqual({ type: "week" });
    });

    it("repairs the date format from its own write type", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [journalConfigCollection] })],
        data: { journals: { "Journal weekly": weekly } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(journalConfigCollection)["Journal weekly"].dateFormat).toBe("YYYY-[W]w");
    });

    it("keeps the folder, name template and templates the user configured", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [journalConfigCollection] })],
        data: { journals: { "Journal weekly": weekly } },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(journalConfigCollection)["Journal weekly"]).toMatchObject({
        nameTemplate: "{{date:YYYY-[W]ww}}",
        folder: "02 - Journal/Weekly",
        templates: ["99 - Meta/Templates/Weekly Note Template.md"],
      });
    });
  });

  describe("initialize — failures", () => {
    it("returns SliceKeyConflictError when two slices share a key", async () => {
      const dup = defineSlice("calendar", calendarSchema, { dow: 1, global: true });
      await expect(
        testContainer({ modules: [testSettingsModule({ slices: [calendarSlice, dup] })] }),
      ).rejects.toBeInstanceOf(SliceKeyConflictError);
    });

    it("returns MigrationFailedError when the version cannot reach current", async () => {
      await expect(
        testContainer({ modules: [testSettingsModule({ migrations: [] })], data: { version: 1 } }),
      ).rejects.toBeInstanceOf(MigrationFailedError);
    });
  });

  describe("initialize — snapshot before migration", () => {
    const bump: Migration = { fromVersion: 4, toVersion: 5, migrate: (raw) => ({ ...raw, migrated: true }) };

    it("writes the pre-migration data when the stored version is behind", async () => {
      const raw = { version: 4, calendar: { dow: 5, global: false } };
      const harness = await testContainer({ modules: [testSettingsModule({ migrations: [bump] })], data: raw });

      const names = [...harness.data.files.keys()];
      expect(names).toHaveLength(1);
      expect(JSON.parse(harness.data.files.get(names[0]) ?? "")).toEqual(raw);
    });

    it("writes nothing when the stored version is already current", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 5, global: false } },
      });

      expect([...harness.data.files.keys()]).toEqual([]);
    });

    it("writes nothing on a fresh install with no stored data", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()] });

      expect([...harness.data.files.keys()]).toEqual([]);
    });

    it("still loads when the snapshot cannot be written", async () => {
      const data = new FakePluginData({ version: 4, calendar: { dow: 5, global: false } });
      vi.spyOn(data, "writeFile").mockReturnValueOnce(
        AsyncResult.err(new PluginDataIOError("write-file", new Error("disk full"))),
      );

      const harness = await testContainer({ modules: [testSettingsModule({ migrations: [bump] })], pluginData: data });

      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(5);
    });

    it("writes no second snapshot on a later boot over the same unchanged stored data", async () => {
      // initialize() never flushes the migrated result back to data.json, so a user who
      // upgrades and never touches a setting re-enters #loadAndMigrate with the same
      // pre-migration raw on every subsequent launch. The FakePluginData instance is
      // reused across two SettingsService builds to stand in for that: same stored bytes,
      // same version, a fresh in-memory service each time — exactly a second boot.
      //
      // The clock is advanced between boots so the two writes would land under distinct
      // timestamped filenames if the guard were absent — same-second collisions already
      // dedupe by accident, which would make this pass whether or not the fix is present.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-16T10:20:30.000Z"));
      const raw = { version: 4, calendar: { dow: 5, global: false } };
      const data = new FakePluginData(raw);
      await testContainer({ modules: [testSettingsModule({ migrations: [bump] })], pluginData: data });
      expect([...data.files.keys()]).toHaveLength(1);

      vi.setSystemTime(new Date("2026-08-16T10:25:00.000Z"));
      await testContainer({ modules: [testSettingsModule({ migrations: [bump] })], pluginData: data });

      expect([...data.files.keys()]).toHaveLength(1);
      vi.useRealTimers();
    });
  });

  describe("getSlice", () => {
    it("throws UnregisteredSliceError for a slice that was never bound", async () => {
      const ghost = defineSlice("ghost", v.object({}), {});
      const harness = await testContainer({ modules: [testSettingsModule()] });
      expect(() => harness.settings.getSlice(ghost)).toThrow(UnregisteredSliceError);
    });
  });

  describe("recordOf", () => {
    it("returns the reactive Record for a registered collection", async () => {
      const harness = await testContainer({ modules: [testSettingsModule({ collections: [journalCollection] })] });
      const record = harness.settings.recordOf(journalCollection);
      expect(record).toEqual({});
    });

    it("returns the same reference across calls", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
      });
      const first = harness.settings.recordOf(journalCollection);
      const second = harness.settings.recordOf(journalCollection);
      expect(first).toBe(second);
    });

    it("reflects mutations made to the record", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
      });
      const record = harness.settings.recordOf(journalCollection);
      record.alpha = { name: "alpha" };
      expect(harness.settings.recordOf(journalCollection).alpha).toEqual({ name: "alpha" });
    });

    it("throws UnregisteredSliceError when the collection key is not registered", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
      });
      const other = defineCollection("ghost", v.object({}), () => ({}));
      expect(() => harness.settings.recordOf(other)).toThrow(UnregisteredSliceError);
    });
  });

  describe("collection seed-on-absent", () => {
    const seededCollection = defineCollection("seeded", journalSchema, (id) => ({ name: id }), {
      seed: () => ({ alpha: { name: "seeded-alpha" } }),
    });

    it("seeds a collection when its key is absent from stored data", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [seededCollection] })],
        data: {},
      });
      expect(harness.settings.recordOf(seededCollection)).toEqual({ alpha: { name: "seeded-alpha" } });
    });

    it("does not seed when the collection key is present but empty", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [seededCollection] })],
        data: { seeded: {} },
      });
      expect(harness.settings.recordOf(seededCollection)).toEqual({});
    });
  });

  describe("collection value validation", () => {
    it.each([
      ["string", "nonsense"],
      ["null", null],
      ["array", []],
    ])("names a discarded collection value's stored shape as %s", async (shape, stored) => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
        data: { journals: stored },
        allow: { dataRepair: true },
      });

      expect(
        harness.logs.records.filter(
          (record) => record.message === "collection discarded; stored value is not an object",
        ),
      ).toEqual([expect.objectContaining({ fields: { sliceKey: "journals", stored: shape } })]);
    });

    it("discards a stored collection value that is not an object", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
        data: { journals: "nonsense" },
        allow: { dataRepair: true },
      });

      expect(harness.settings.recordOf(journalCollection)).toEqual({});
    });

    it("stays silent when a collection key is absent from stored data", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
        data: {},
      });

      expect(harness.logs.records.filter((record) => record.level === "warn")).toEqual([]);
    });
  });

  describe("reload", () => {
    it("returns ok and does nothing before initialize", async () => {
      const harness = await testContainer({ modules: [testSettingsModule(), secondSettingsServiceModule()] });
      const second = harness.resolve(secondSettingsServiceToken);
      const reload = await second.reload();
      expectOk(reload);
    });

    it("applies externally changed slice values to in-memory state", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 0, global: false } },
      });
      await harness.data.save({ version: 5, calendar: { dow: 6, global: true } });
      const reload = await harness.settings.reload();
      expectOk(reload);
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(6);
    });

    it("applies externally added collection entries through the recordOf reference", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
        data: { journals: { a: { name: "a" } } },
      });
      const record = harness.settings.recordOf(journalCollection);
      await harness.data.save({ version: 5, journals: { a: { name: "a-renamed" }, b: { name: "b" } } });
      await harness.settings.reload();
      expect(record.a).toEqual({ name: "a-renamed" });
      expect(record.b).toEqual({ name: "b" });
    });

    it("removes collection entries deleted on another device through the recordOf reference", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ slices: [], collections: [journalCollection] })],
        data: { journals: { a: { name: "a" }, b: { name: "b" } } },
      });
      const record = harness.settings.recordOf(journalCollection);
      await harness.data.save({ version: 5, journals: { a: { name: "a" } } });
      await harness.settings.reload();
      expect(record.b).toBeUndefined();
    });

    it("propagates a migration failure as an error", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      await harness.data.save({ version: 99 });
      const reload = await harness.settings.reload();
      expectErr(reload);
      expect(reload.error).toBeInstanceOf(MigrationFailedError);
    });

    it("emits reloaded so event-driven subsystems can re-derive", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      const events = harness.resolve(SettingsEventsToken);
      const listener = vi.fn();
      events.on("reloaded", listener);
      await harness.data.save({ version: 5, calendar: { dow: 3, global: true } });
      await harness.settings.reload();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("reload — no save echo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not write back to disk when refreshing from an external change", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 0, global: false } },
      });
      await harness.data.save({ version: 5, calendar: { dow: 2, global: true } });
      const saveSpy = vi.spyOn(harness.data, "save");
      const reload = await harness.settings.reload();
      expectOk(reload);
      await vi.advanceTimersByTimeAsync(300);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe("debounced save", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("coalesces multiple mutations within the debounce window into one save", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      const saveSpy = vi.spyOn(harness.data, "save");
      const slice = harness.settings.getSlice(calendarSlice);
      slice.state.dow = 2;
      slice.state.dow = 3;
      slice.state.dow = 4;
      await vi.advanceTimersByTimeAsync(300);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect((saveSpy.mock.calls[0][0] as { calendar: { dow: number } }).calendar.dow).toBe(4);
    });

    it("does not save during the debounce window", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      const saveSpy = vi.spyOn(harness.data, "save");
      harness.settings.getSlice(calendarSlice).state.dow = 2;
      await vi.advanceTimersByTimeAsync(100);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe("save failure", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("keeps state in memory when save fails", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      vi.spyOn(harness.data, "save").mockReturnValue(AsyncResult.err(new PluginDataIOError("save", new Error("disk"))));
      harness.settings.getSlice(calendarSlice).state.dow = 7;
      await vi.advanceTimersByTimeAsync(300);
      await vi.runAllTimersAsync();
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(7);
    });
  });

  describe("replaceStoredData", () => {
    it("writes the replacement and re-hydrates from it", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 1, global: true } },
      });

      expectOk(await harness.settings.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } }));

      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(6);
      const stored = await harness.data.load();
      expectOk(stored);
      expect(stored.value).toEqual({ version: 5, calendar: { dow: 6, global: false } });
    });

    it("leaves data.json untouched when the replacement cannot be migrated", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 1, global: true } },
      });

      const replaced = await harness.settings.replaceStoredData({ version: 99 });

      expectErr(replaced);
      expect(replaced.error).toBeInstanceOf(MigrationFailedError);
      const stored = await harness.data.load();
      expectOk(stored);
      expect(stored.value).toEqual({ version: 5, calendar: { dow: 1, global: true } });
      expect(harness.settings.getSlice(calendarSlice).state.dow).toBe(1);
    });

    it("cancels a pending save so it cannot land on top of the replacement", async () => {
      vi.useFakeTimers();
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 1, global: true } },
      });
      const saveSpy = vi.spyOn(harness.data, "save");
      harness.settings.getSlice(calendarSlice).state = { dow: 3, global: true };
      await nextTick();

      expectOk(await harness.settings.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } }));
      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      // #flush() reads the live #root, so a stale timer firing after replaceStoredData
      // finishes would just re-save the already-correct state — asserting the restored
      // dow alone can't tell a cancelled timer from one that fired harmlessly. The call
      // count is what actually distinguishes them: replaceStoredData's own write is the
      // only save that should happen.
      expect(saveSpy).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("leaves the watcher armed when the write fails, so a later mutation still schedules a save", async () => {
      vi.useFakeTimers();
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 1, global: true } },
      });
      const saveSpy = vi
        .spyOn(harness.data, "save")
        .mockReturnValueOnce(AsyncResult.err(new PluginDataIOError("save", new Error("disk full"))));

      const replaced = await harness.settings.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } });
      expectErr(replaced);
      expect(replaced.error).toBeInstanceOf(SettingsSaveError);

      harness.settings.getSlice(calendarSlice).state.dow = 9;
      await vi.advanceTimersByTimeAsync(300);

      expect(saveSpy).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("emits reloaded so event-driven subsystems re-derive", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule()],
        data: { calendar: { dow: 1, global: true } },
      });
      const events = harness.resolve(SettingsEventsToken);
      let reloaded = 0;
      events.on("reloaded", () => (reloaded += 1));

      await harness.settings.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } });

      expect(reloaded).toBe(1);
    });

    it("does nothing before initialize", async () => {
      const harness = await testContainer({ modules: [testSettingsModule(), secondSettingsServiceModule()] });
      const second = harness.resolve(secondSettingsServiceToken);

      expectOk(await second.replaceStoredData({ version: 5 }));

      const stored = await harness.data.load();
      expectOk(stored);
      expect(stored.value).toBeUndefined();
    });

    it("saves a behind-current payload byte-for-byte, not the object the validation pass mutated in place", async () => {
      const harness = await testContainer({
        modules: [testSettingsModule({ collections: [], migrations: [v4ToV5Migration] })],
        data: { calendar: { dow: 1, global: true } },
      });

      const legacyPayload = {
        version: 4,
        calendar: { dow: 1, global: true },
        journals: {
          daily: { navBlock: { rows: [{ kind: "shift", shift: -1 }] } },
        },
      };
      let savedPayload: unknown;
      const originalSave = harness.data.save.bind(harness.data);
      vi.spyOn(harness.data, "save").mockImplementation((payload: unknown) => {
        savedPayload = JSON.parse(JSON.stringify(payload));
        return originalSave(payload);
      });

      expectOk(await harness.settings.replaceStoredData(legacyPayload));

      const stored = savedPayload as { version: number; journals: { daily: { navBlock: unknown } } };
      expect(stored.version).toBe(4);
      expect(stored.journals.daily.navBlock).toEqual({ rows: [{ kind: "shift", shift: -1 }] });
    });

    it("snapshots the current data.json before a restore overwrites it", async () => {
      const data = new FakePluginData({ version: CURRENT_VERSION, journals: { daily: { name: "daily" } } });
      const harness = await testContainer({ pluginData: data });
      const snapshots = harness.resolve(SnapshotService);

      expectOk(await harness.settings.replaceStoredData({ version: CURRENT_VERSION, journals: {} }));

      const listed = await snapshots.list();
      expectOk(listed);
      const preRestore = listed.value.filter((info) => info.reason === "pre-restore");
      expect(preRestore).toHaveLength(1);
      const contents = await snapshots.read(preRestore.at(0)?.name ?? "");
      expectOk(contents);
      expect(contents.value.journals).toEqual({ daily: { name: "daily" } });
    });

    it("keeps only the three most recent pre-restore snapshots", async () => {
      // Advance the clock a full second between restores: stampOf truncates to whole
      // seconds, so four restores issued back-to-back on the real clock would collide
      // onto one filename and this would pass with prune() never called.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
      const data = new FakePluginData({ version: CURRENT_VERSION });
      const harness = await testContainer({ pluginData: data });
      const snapshots = harness.resolve(SnapshotService);

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(new Date(Date.now() + 1000));
        expectOk(await harness.settings.replaceStoredData({ version: CURRENT_VERSION, marker: i }));
      }

      const listed = await snapshots.list();
      expectOk(listed);
      expect(listed.value.filter((info) => info.reason === "pre-restore")).toHaveLength(3);
      vi.useRealTimers();
    });

    it("still restores when the pre-restore snapshot cannot be written", async () => {
      const data = new FakePluginData({ version: CURRENT_VERSION });
      const harness = await testContainer({ pluginData: data });
      const snapshots = harness.resolve(SnapshotService);
      vi.spyOn(snapshots, "writePreRestore").mockReturnValueOnce(
        AsyncResult.err(new PluginDataIOError("write-file", { message: "disk full" })),
      );

      expectOk(await harness.settings.replaceStoredData({ version: CURRENT_VERSION, marker: "restored" }));
    });
  });

  describe("dispose", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("cancels a pending save so it does not fire after dispose", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      const saveSpy = vi.spyOn(harness.data, "save");
      harness.settings.getSlice(calendarSlice).state.dow = 9;
      harness.settings[Symbol.dispose]();
      await vi.advanceTimersByTimeAsync(500);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it("stops reacting to mutations after dispose", async () => {
      const harness = await testContainer({ modules: [testSettingsModule()], data: {} });
      const saveSpy = vi.spyOn(harness.data, "save");
      harness.settings[Symbol.dispose]();
      harness.settings.getSlice(calendarSlice).state.dow = 9;
      await vi.advanceTimersByTimeAsync(500);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
