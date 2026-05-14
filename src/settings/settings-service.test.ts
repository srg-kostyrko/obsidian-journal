import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { PluginData, PluginDataIOError } from "@/infrastructure/host";
import { FakePluginData } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken, LogSinkMultiToken } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { SliceKeyConflictError, MigrationFailedError, UnregisteredSliceError } from "./errors";
import { defineCollection, defineSlice, type Migration } from "./schema";
import { SettingsService } from "./settings-service";
import { CollectionDefinitionToken, MigrationToken, SliceDefinitionToken } from "./tokens";

const calendarSchema = v.object({
  dow: v.number(),
  global: v.boolean(),
});

const calendarSlice = defineSlice("calendar", calendarSchema, { dow: 1, global: true });

const journalSchema = v.object({ name: v.string() });
const journalCollection = defineCollection("journals", journalSchema, (id) => ({ name: id }));

function build(
  options: {
    raw?: unknown;
    slices?: readonly unknown[];
    collections?: readonly unknown[];
    migrations?: readonly Migration[];
  } = {},
): { service: SettingsService; data: FakePluginData } {
  const data = new FakePluginData(options.raw);
  const c = new Container();
  c.register(PluginData).useValue(data as unknown as PluginData);
  c.register(LogSinkMultiToken).useValue(new MemorySink());
  c.register(LoggerFactoryToken).useClass(LoggerFactory);
  for (const s of options.slices ?? [calendarSlice]) {
    c.register(SliceDefinitionToken).useValue(s as never);
  }
  for (const col of options.collections ?? [journalCollection]) {
    c.register(CollectionDefinitionToken).useValue(col as never);
  }
  // The migration multi-token must always have at least one binding to satisfy DI.
  // The identity entry (from === to) is filtered out by runMigrations.
  const identity: Migration = { fromVersion: -1, toVersion: -1, migrate: (r) => r };
  c.register(MigrationToken).useValue(identity);
  for (const m of options.migrations ?? []) {
    c.register(MigrationToken).useValue(m);
  }
  c.register(SettingsService).useClass(SettingsService);
  return { service: c.resolve(SettingsService), data };
}

describe("SettingsService", () => {
  describe("initialize — happy path", () => {
    it("hydrates a slice from a stored root", async () => {
      const { service } = build({ raw: { version: 3, calendar: { dow: 0, global: false } } });
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
      const bumpToV3: Migration = {
        fromVersion: 0,
        toVersion: 3,
        migrate: (r) => ({ ...r, calendar: { dow: 5, global: true } }),
      };
      const { service } = build({ raw: { calendar: { dow: 0, global: false } }, migrations: [bumpToV3] });
      const init = await service.initialize();
      expectOk(init);
      expect(service.getSlice(calendarSlice).state.dow).toBe(5);
    });
  });

  describe("initialize — slice validation fallback", () => {
    it("falls back to defaults when a stored slice fails validation", async () => {
      const { service } = build({ raw: { version: 3, calendar: { dow: "not-a-number" } } });
      await service.initialize();
      expect(service.getSlice(calendarSlice).state.dow).toBe(1);
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

  describe("getSlice / getCollection", () => {
    it("throws UnregisteredSliceError for a slice that was never bound", async () => {
      const ghost = defineSlice("ghost", v.object({}), {});
      const { service } = build();
      await service.initialize();
      expect(() => service.getSlice(ghost)).toThrow(UnregisteredSliceError);
    });

    it("returns a CollectionHandle whose add() updates entries", async () => {
      const { service } = build();
      await service.initialize();
      const handle = service.getCollection(journalCollection);
      handle.add("daily");
      expect(handle.get("daily")?.name).toBe("daily");
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
      const { service, data } = build({ raw: { version: 3 } });
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
      const { service, data } = build({ raw: { version: 3 } });
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
      const { service, data } = build({ raw: { version: 3 } });
      await service.initialize();
      vi.spyOn(data, "save").mockReturnValue(AsyncResult.err(new PluginDataIOError("save", new Error("disk"))));
      service.getSlice(calendarSlice).state.dow = 7;
      await vi.advanceTimersByTimeAsync(300);
      await vi.runAllTimersAsync();
      expect(service.getSlice(calendarSlice).state.dow).toBe(7);
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
      const { service, data } = build({ raw: { version: 3 } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      service.getSlice(calendarSlice).state.dow = 9;
      service[Symbol.dispose]();
      await vi.advanceTimersByTimeAsync(500);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it("stops reacting to mutations after dispose", async () => {
      const { service, data } = build({ raw: { version: 3 } });
      await service.initialize();
      const saveSpy = vi.spyOn(data, "save");
      service[Symbol.dispose]();
      service.getSlice(calendarSlice).state.dow = 9;
      await vi.advanceTimersByTimeAsync(500);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
