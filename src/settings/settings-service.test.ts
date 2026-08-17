import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { Container } from "@/infrastructure/di";
import { PluginData, PluginDataIOError } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { journalConfigCollection } from "@/journals/config";

import { SliceKeyConflictError, MigrationFailedError, SettingsSaveError, UnregisteredSliceError } from "./errors";
import { v4ToV5Migration } from "./legacy/v4-to-v5";
import { defineCollection, defineSlice, type Migration } from "./schema";
import { SettingsService } from "./settings-service";
import { SnapshotService } from "./snapshots/snapshot-service";
import {
  CollectionDefinitionToken,
  MigrationToken,
  SettingsEventsToken,
  SliceDefinitionToken,
  type SettingsEvents,
} from "./tokens";

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

function build(
  options: {
    raw?: unknown;
    data?: FakePluginData;
    slices?: readonly unknown[];
    collections?: readonly unknown[];
    migrations?: readonly Migration[];
  } = {},
): { service: SettingsService; data: FakePluginData; events: ReturnType<typeof createNanoEvents<SettingsEvents>> } {
  const data = options.data ?? new FakePluginData(options.raw);
  const events = createNanoEvents<SettingsEvents>();
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  c.register(SnapshotService).useClass(SnapshotService);
  c.register(SettingsEventsToken).useValue(events);
  c.addModule(createLoggerTestingModule().module);
  const slices = options.slices ?? [calendarSlice];
  for (const s of slices) {
    c.register(SliceDefinitionToken).useValue(s as never);
  }
  const collections = options.collections ?? [journalCollection];
  for (const col of collections) {
    c.register(CollectionDefinitionToken).useValue(col as never);
  }
  const migrations = options.migrations ?? [];
  for (const m of migrations) {
    c.register(MigrationToken).useValue(m);
  }
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data, events };
}

describe("SettingsService", () => {
  describe("initialize — happy path", () => {
    it("hydrates a slice from a stored root", async () => {
      const { service } = build({ raw: { version: 5, calendar: { dow: 0, global: false } } });
      const init = await service.initialize();
      expectOk(init);
      expect(service.getSlice(calendarSlice).state.dow).toBe(0);
      expect(service.getSlice(calendarSlice).state.global).toBe(false);
    });

    it("starts a fresh install with defaults when no data exists", async () => {
      const { service } = build({ raw: undefined });
      const init = await service.initialize();
      expectOk(init);
      expect(service.getSlice(calendarSlice).state.dow).toBe(1);
    });

    it("treats a missing root version as 0 and runs migrations up to current", async () => {
      const bumpToCurrent: Migration = {
        fromVersion: 0,
        toVersion: 5,
        migrate: (r) => ({ ...r, calendar: { dow: 5, global: true } }),
      };
      const { service } = build({ raw: { calendar: { dow: 0, global: false } }, migrations: [bumpToCurrent] });
      const init = await service.initialize();
      expectOk(init);
      expect(service.getSlice(calendarSlice).state.dow).toBe(5);
    });
  });

  describe("initialize — slice validation fallback", () => {
    it("falls back to defaults when a stored slice fails validation", async () => {
      const { service } = build({ raw: { version: 5, calendar: { dow: "not-a-number" } } });
      expectOk(await service.initialize());
      expect(service.getSlice(calendarSlice).state.dow).toBe(1);
    });
  });

  // These fixtures are already at CURRENT_VERSION and register no migration: a stored version
  // below it would fail runMigrations, and initialize would return Err before hydrating — which
  // surfaces as an undefined collection record rather than a migration error. Hence expectOk.
  describe("initialize — collection entry repair", () => {
    it("keeps the fields that validate and repairs only the ones that do not", async () => {
      const raw = { version: 5, pets: { Rex: { name: "Rex", kind: "dog", sound: "", toys: ["ball"] } } };
      const { service } = build({ raw, collections: [petCollection] });

      expectOk(await service.initialize());

      expect(service.recordOf(petCollection).Rex).toEqual({
        name: "Rex",
        kind: "dog",
        sound: "woof",
        toys: ["ball"],
      });
    });

    it("derives the repaired value from the entry's own stored fields", async () => {
      const raw = { version: 5, pets: { Rex: { name: "Rex", kind: "dog", sound: "" } } };
      const { service } = build({ raw, collections: [petCollection] });

      expectOk(await service.initialize());

      expect(service.recordOf(petCollection).Rex.sound).toBe("woof");
    });

    it("falls back to the whole default when the entry is not an object", async () => {
      const { service } = build({ raw: { version: 5, pets: { Rex: "not an entry" } }, collections: [petCollection] });

      expectOk(await service.initialize());

      expect(service.recordOf(petCollection).Rex).toEqual({ name: "Rex", kind: "cat", sound: "meow", toys: [] });
    });

    it("falls back to the whole default when the failure names no field", async () => {
      const raw = { version: 5, pets: { Rex: { name: "woof", kind: "dog", sound: "woof", toys: ["ball"] } } };
      const { service } = build({ raw, collections: [checkedPetCollection] });

      expectOk(await service.initialize());

      expect(service.recordOf(checkedPetCollection).Rex).toEqual({
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
      const { service } = build({
        raw: { version: 5, journals: { "Journal weekly": weekly } },
        collections: [journalConfigCollection],
      });

      expectOk(await service.initialize());

      expect(service.recordOf(journalConfigCollection)["Journal weekly"].write).toEqual({ type: "week" });
    });

    it("repairs the date format from its own write type", async () => {
      const { service } = build({
        raw: { version: 5, journals: { "Journal weekly": weekly } },
        collections: [journalConfigCollection],
      });

      expectOk(await service.initialize());

      expect(service.recordOf(journalConfigCollection)["Journal weekly"].dateFormat).toBe("YYYY-[W]w");
    });

    it("keeps the folder, name template and templates the user configured", async () => {
      const { service } = build({
        raw: { version: 5, journals: { "Journal weekly": weekly } },
        collections: [journalConfigCollection],
      });

      expectOk(await service.initialize());

      expect(service.recordOf(journalConfigCollection)["Journal weekly"]).toMatchObject({
        nameTemplate: "{{date:YYYY-[W]ww}}",
        folder: "02 - Journal/Weekly",
        templates: ["99 - Meta/Templates/Weekly Note Template.md"],
      });
    });
  });

  describe("initialize — failures", () => {
    it("returns SliceKeyConflictError when two slices share a key", async () => {
      const dup = defineSlice("calendar", calendarSchema, { dow: 1, global: true });
      const { service } = build({ slices: [calendarSlice, dup] });
      const init = await service.initialize();
      expectErr(init);
      expect(init.error).toBeInstanceOf(SliceKeyConflictError);
    });

    it("returns MigrationFailedError when the version cannot reach current", async () => {
      const { service } = build({ raw: { version: 1 }, migrations: [] });
      const init = await service.initialize();
      expectErr(init);
      expect(init.error).toBeInstanceOf(MigrationFailedError);
    });
  });

  describe("initialize — snapshot before migration", () => {
    const bump: Migration = { fromVersion: 4, toVersion: 5, migrate: (raw) => ({ ...raw, migrated: true }) };

    it("writes the pre-migration data when the stored version is behind", async () => {
      const raw = { version: 4, calendar: { dow: 5, global: false } };
      const { service, data } = build({ raw, migrations: [bump] });

      await service.initialize();

      const names = [...data.files.keys()];
      expect(names).toHaveLength(1);
      expect(JSON.parse(data.files.get(names[0]) ?? "")).toEqual(raw);
    });

    it("writes nothing when the stored version is already current", async () => {
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 5, global: false } } });

      await service.initialize();

      expect([...data.files.keys()]).toEqual([]);
    });

    it("writes nothing on a fresh install with no stored data", async () => {
      const { service, data } = build();

      await service.initialize();

      expect([...data.files.keys()]).toEqual([]);
    });

    it("still loads when the snapshot cannot be written", async () => {
      const raw = { version: 4, calendar: { dow: 5, global: false } };
      const { service, data } = build({ raw, migrations: [bump] });
      vi.spyOn(data, "writeFile").mockReturnValueOnce(
        AsyncResult.err(new PluginDataIOError("write-file", new Error("disk full"))),
      );

      const init = await service.initialize();

      expectOk(init);
      expect(service.getSlice(calendarSlice).state.dow).toBe(5);
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
      const first = build({ data, migrations: [bump] });
      await first.service.initialize();
      expect([...data.files.keys()]).toHaveLength(1);

      vi.setSystemTime(new Date("2026-08-16T10:25:00.000Z"));
      const second = build({ data, migrations: [bump] });
      await second.service.initialize();

      expect([...data.files.keys()]).toHaveLength(1);
      vi.useRealTimers();
    });
  });

  describe("getSlice", () => {
    it("throws UnregisteredSliceError for a slice that was never bound", async () => {
      const ghost = defineSlice("ghost", v.object({}), {});
      const { service } = build();
      await service.initialize();
      expect(() => service.getSlice(ghost)).toThrow(UnregisteredSliceError);
    });
  });

  describe("recordOf", () => {
    it("returns the reactive Record for a registered collection", async () => {
      const { service } = build({ slices: [calendarSlice], collections: [journalCollection] });
      const init = await service.initialize();
      expect(init.kind).toBe("ok");
      const record = service.recordOf(journalCollection);
      expect(record).toEqual({});
    });

    it("returns the same reference across calls", async () => {
      const { service } = build({ slices: [], collections: [journalCollection] });
      await service.initialize();
      const first = service.recordOf(journalCollection);
      const second = service.recordOf(journalCollection);
      expect(first).toBe(second);
    });

    it("reflects mutations made to the record", async () => {
      const { service } = build({ slices: [], collections: [journalCollection] });
      await service.initialize();
      const record = service.recordOf(journalCollection);
      record.alpha = { name: "alpha" };
      expect(service.recordOf(journalCollection).alpha).toEqual({ name: "alpha" });
    });

    it("throws UnregisteredSliceError when the collection key is not registered", async () => {
      const { service } = build({ slices: [], collections: [journalCollection] });
      await service.initialize();
      const other = defineCollection("ghost", v.object({}), () => ({}));
      expect(() => service.recordOf(other)).toThrow(UnregisteredSliceError);
    });
  });

  describe("collection seed-on-absent", () => {
    const seededCollection = defineCollection("seeded", journalSchema, (id) => ({ name: id }), {
      seed: () => ({ alpha: { name: "seeded-alpha" } }),
    });

    it("seeds a collection when its key is absent from stored data", async () => {
      const { service } = build({ slices: [], collections: [seededCollection], raw: { version: 5 } });
      await service.initialize();
      expect(service.recordOf(seededCollection)).toEqual({ alpha: { name: "seeded-alpha" } });
    });

    it("does not seed when the collection key is present but empty", async () => {
      const { service } = build({ slices: [], collections: [seededCollection], raw: { version: 5, seeded: {} } });
      await service.initialize();
      expect(service.recordOf(seededCollection)).toEqual({});
    });
  });

  describe("reload", () => {
    it("returns ok and does nothing before initialize", async () => {
      const { service } = build();
      const reload = await service.reload();
      expectOk(reload);
    });

    it("applies externally changed slice values to in-memory state", async () => {
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 0, global: false } } });
      await service.initialize();
      await data.save({ version: 5, calendar: { dow: 6, global: true } });
      const reload = await service.reload();
      expectOk(reload);
      expect(service.getSlice(calendarSlice).state.dow).toBe(6);
    });

    it("applies externally added collection entries through the recordOf reference", async () => {
      const { service, data } = build({
        slices: [],
        collections: [journalCollection],
        raw: { version: 5, journals: { a: { name: "a" } } },
      });
      await service.initialize();
      const record = service.recordOf(journalCollection);
      await data.save({ version: 5, journals: { a: { name: "a-renamed" }, b: { name: "b" } } });
      await service.reload();
      expect(record.a).toEqual({ name: "a-renamed" });
      expect(record.b).toEqual({ name: "b" });
    });

    it("removes collection entries deleted on another device through the recordOf reference", async () => {
      const { service, data } = build({
        slices: [],
        collections: [journalCollection],
        raw: { version: 5, journals: { a: { name: "a" }, b: { name: "b" } } },
      });
      await service.initialize();
      const record = service.recordOf(journalCollection);
      await data.save({ version: 5, journals: { a: { name: "a" } } });
      await service.reload();
      expect(record.b).toBeUndefined();
    });

    it("propagates a migration failure as an error", async () => {
      const { service, data } = build({ raw: { version: 5 } });
      await service.initialize();
      await data.save({ version: 99 });
      const reload = await service.reload();
      expectErr(reload);
      expect(reload.error).toBeInstanceOf(MigrationFailedError);
    });

    it("emits reloaded so event-driven subsystems can re-derive", async () => {
      const { service, data, events } = build({ raw: { version: 5 } });
      await service.initialize();
      const listener = vi.fn();
      events.on("reloaded", listener);
      await data.save({ version: 5, calendar: { dow: 3, global: true } });
      await service.reload();
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
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 0, global: false } } });
      await service.initialize();
      await data.save({ version: 5, calendar: { dow: 2, global: true } });
      const saveSpy = vi.spyOn(data, "save");
      const reload = await service.reload();
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
      const { service, data } = build({ raw: { version: 5 } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      const slice = service.getSlice(calendarSlice);
      slice.state.dow = 2;
      slice.state.dow = 3;
      slice.state.dow = 4;
      await vi.advanceTimersByTimeAsync(300);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect((saveSpy.mock.calls[0][0] as { calendar: { dow: number } }).calendar.dow).toBe(4);
    });

    it("does not save during the debounce window", async () => {
      const { service, data } = build({ raw: { version: 5 } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      service.getSlice(calendarSlice).state.dow = 2;
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
      const { service, data } = build({ raw: { version: 5 } });
      await service.initialize();
      vi.spyOn(data, "save").mockReturnValue(AsyncResult.err(new PluginDataIOError("save", new Error("disk"))));
      service.getSlice(calendarSlice).state.dow = 7;
      await vi.advanceTimersByTimeAsync(300);
      await vi.runAllTimersAsync();
      expect(service.getSlice(calendarSlice).state.dow).toBe(7);
    });
  });

  describe("replaceStoredData", () => {
    it("writes the replacement and re-hydrates from it", async () => {
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 1, global: true } } });
      await service.initialize();

      expectOk(await service.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } }));

      expect(service.getSlice(calendarSlice).state.dow).toBe(6);
      const stored = await data.load();
      expectOk(stored);
      expect(stored.value).toEqual({ version: 5, calendar: { dow: 6, global: false } });
    });

    it("leaves data.json untouched when the replacement cannot be migrated", async () => {
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 1, global: true } } });
      await service.initialize();

      const replaced = await service.replaceStoredData({ version: 99 });

      expectErr(replaced);
      expect(replaced.error).toBeInstanceOf(MigrationFailedError);
      const stored = await data.load();
      expectOk(stored);
      expect(stored.value).toEqual({ version: 5, calendar: { dow: 1, global: true } });
      expect(service.getSlice(calendarSlice).state.dow).toBe(1);
    });

    it("cancels a pending save so it cannot land on top of the replacement", async () => {
      vi.useFakeTimers();
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 1, global: true } } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      service.getSlice(calendarSlice).state = { dow: 3, global: true };
      await nextTick();

      expectOk(await service.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } }));
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
      const { service, data } = build({ raw: { version: 5, calendar: { dow: 1, global: true } } });
      await service.initialize();
      const saveSpy = vi
        .spyOn(data, "save")
        .mockReturnValueOnce(AsyncResult.err(new PluginDataIOError("save", new Error("disk full"))));

      const replaced = await service.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } });
      expectErr(replaced);
      expect(replaced.error).toBeInstanceOf(SettingsSaveError);

      service.getSlice(calendarSlice).state.dow = 9;
      await vi.advanceTimersByTimeAsync(300);

      expect(saveSpy).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it("emits reloaded so event-driven subsystems re-derive", async () => {
      const { service, events } = build({ raw: { version: 5, calendar: { dow: 1, global: true } } });
      await service.initialize();
      let reloaded = 0;
      events.on("reloaded", () => (reloaded += 1));

      await service.replaceStoredData({ version: 5, calendar: { dow: 6, global: false } });

      expect(reloaded).toBe(1);
    });

    it("does nothing before initialize", async () => {
      const { service, data } = build();

      expectOk(await service.replaceStoredData({ version: 5 }));

      const stored = await data.load();
      expectOk(stored);
      expect(stored.value).toBeUndefined();
    });

    it("saves a behind-current payload byte-for-byte, not the object the validation pass mutated in place", async () => {
      const { service, data } = build({
        raw: { version: 5, calendar: { dow: 1, global: true } },
        collections: [],
        migrations: [v4ToV5Migration],
      });
      await service.initialize();

      const legacyPayload = {
        version: 4,
        calendar: { dow: 1, global: true },
        journals: {
          daily: { navBlock: { rows: [{ kind: "shift", shift: -1 }] } },
        },
      };
      let savedPayload: unknown;
      const originalSave = data.save.bind(data);
      vi.spyOn(data, "save").mockImplementation((payload: unknown) => {
        savedPayload = JSON.parse(JSON.stringify(payload));
        return originalSave(payload);
      });

      expectOk(await service.replaceStoredData(legacyPayload));

      const stored = savedPayload as { version: number; journals: { daily: { navBlock: unknown } } };
      expect(stored.version).toBe(4);
      expect(stored.journals.daily.navBlock).toEqual({ rows: [{ kind: "shift", shift: -1 }] });
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
      const { service, data } = build({ raw: { version: 5 } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      service.getSlice(calendarSlice).state.dow = 9;
      service[Symbol.dispose]();
      await vi.advanceTimersByTimeAsync(500);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it("stops reacting to mutations after dispose", async () => {
      const { service, data } = build({ raw: { version: 5 } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      service[Symbol.dispose]();
      service.getSlice(calendarSlice).state.dow = 9;
      await vi.advanceTimersByTimeAsync(500);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
