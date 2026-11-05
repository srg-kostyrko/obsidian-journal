import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { appearanceVariables } from "@/notes-calendar/appearance/appearance-variables";
import { appearanceSlice, appearanceSliceSchema } from "@/notes-calendar/appearance/slice";
import { testContainer } from "@/testing";

import { runMigrations } from "../migrations";
import { MigrationToken, SliceDefinitionToken } from "../tokens";
import { CURRENT_VERSION } from "../version";

import { legacyMigrations } from "./module";
import { v7ToV8Migration } from "./v7-to-v8";

const custom = (color: string) => ({ type: "custom", color });
const transparent = { type: "transparent" };
const theme = (name: string) => ({ type: "theme", name });

const stockV7 = {
  today: { color: theme("text-accent"), background: transparent },
  active: { color: theme("text-on-accent"), background: theme("interactive-accent") },
  selectedRing: theme("interactive-accent"),
};

function migrated(appearance: unknown) {
  const raw: Record<string, unknown> = { version: 7, appearance };
  const out = v7ToV8Migration.migrate(raw);
  return v.parse(appearanceSliceSchema, out.appearance);
}

describe("v7ToV8Migration", () => {
  it("moves custom colors into part values", () => {
    const state = migrated({
      today: { color: custom("#111111"), background: custom("#222222") },
      active: { color: custom("#333333"), background: custom("#444444") },
      selectedRing: custom("#555555"),
    });

    expect(state.wide.today.text.color).toEqual(custom("#111111"));
    expect(state.wide.today.color).toEqual(custom("#222222"));
    expect(state.wide.active.text.color).toEqual(custom("#333333"));
    expect(state.wide.active.color).toEqual(custom("#444444"));
    expect(state.wide.active.style).toBe("background");
    expect(state.wide.selected.color).toEqual(custom("#555555"));
    expect(state.wide.selected.style).toBe("ring");
  });

  it("turns a non-transparent today background into a background highlight", () => {
    const state = migrated({ ...stockV7, today: { color: theme("text-accent"), background: custom("#222222") } });

    expect(state.wide.today).toMatchObject({ style: "background", strength: 100, color: custom("#222222") });
    expect(appearanceVariables(state)).toEqual({
      "--journal-saved-cell-today-color": "#222222",
      "--journal-saved-cell-today-strength": "1",
    });
  });

  it("keeps a transparent today background as a text highlight", () => {
    const state = migrated({ ...stockV7, today: { color: custom("#111111"), background: transparent } });

    expect(state.wide.today).toMatchObject({ style: "text", color: transparent });
    expect(appearanceVariables(state)).toEqual({ "--journal-saved-cell-today-text-color": "#111111" });
  });

  it("drops a null v7 text color so the v8 default fills it", () => {
    const state = migrated({
      ...stockV7,
      today: { color: null, background: transparent },
      active: { color: null, background: theme("interactive-accent") },
    });

    expect(state).toEqual(appearanceSlice.defaults);
    expect(appearanceVariables(state)).toEqual({});
  });

  it("leaves stock-only settings producing no saved variables", () => {
    const state = migrated(stockV7);

    expect(state).toEqual(appearanceSlice.defaults);
    expect(appearanceVariables(state)).toEqual({});
  });

  it.each([
    ["a missing appearance key", undefined],
    ["a null appearance", null],
    ["a string appearance", "x"],
    ["null parts", { today: null, active: null, selectedRing: null }],
    ["string parts", { today: "x", active: 3, selectedRing: [] }],
  ])("does not throw on %s", (_label, appearance) => {
    const raw: Record<string, unknown> = appearance === undefined ? { version: 7 } : { version: 7, appearance };
    expect(() => v7ToV8Migration.migrate(raw)).not.toThrow();
  });

  it("leaves an appearance that is not an object for the load repair", () => {
    expect(v7ToV8Migration.migrate({ version: 7, appearance: "x" })).toEqual({ version: 7, appearance: "x" });
  });

  it("fills absent parts from the slice defaults", () => {
    expect(migrated({})).toEqual(appearanceSlice.defaults);
    expect(migrated({ today: "x", active: 3 })).toEqual(appearanceSlice.defaults);
  });

  it("does not add an appearance key that was not there", () => {
    expect(v7ToV8Migration.migrate({ version: 7 })).not.toHaveProperty("appearance");
  });

  it("runs in the chain to the current version", () => {
    const raw = { version: 7, appearance: { ...stockV7, selectedRing: custom("#555555") } };
    const result = runMigrations(raw, legacyMigrations, CURRENT_VERSION);

    expect(CURRENT_VERSION).toBe(8);
    const value = result.isOk() ? (result.value as { version: number; appearance: unknown }) : undefined;
    expect(value?.version).toBe(8);
    expect(v.parse(appearanceSliceSchema, value?.appearance).wide.selected.color).toEqual(custom("#555555"));
  });
});

const migratingModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(appearanceSlice);
    c.register(MigrationToken).useValue(v7ToV8Migration);
  },
};

describe("v7ToV8Migration on load", () => {
  it("carries a malformed v7 color to its new place, where the load repair resets and logs it", async () => {
    const harness = await testContainer({
      modules: [migratingModule],
      data: { version: 7, appearance: { ...stockV7, selectedRing: { type: "custom", color: 5 } } },
      allow: { dataRepair: true },
    });

    expect(harness.settings.getSlice(appearanceSlice).state).toEqual(appearanceSlice.defaults);
    const repair = harness.logs.records.find((record) => record.message === "slice fields reset to defaults");
    expect(repair?.fields).toMatchObject({ sliceKey: "appearance", fields: ["wide.selected.color"] });
  });
});
