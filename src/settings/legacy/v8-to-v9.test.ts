import { describe, expect, it } from "vitest";

import { SettingsTooNewError } from "../errors";
import { runMigrations } from "../migrations";
import { CURRENT_VERSION } from "../version";

import { legacyMigrations } from "./module";
import { v8ToV9Migration } from "./v8-to-v9";

const movingDay = {
  mode: "and",
  conditions: [{ type: "date", day: { nth: "last", weekday: 5 }, month: -1, year: null }],
  styles: [],
};

describe("v8ToV9Migration", () => {
  it("targets version 8 -> 9", () => {
    expect(v8ToV9Migration.fromVersion).toBe(8);
    expect(v8ToV9Migration.toVersion).toBe(9);
  });

  it("leaves the stored settings unchanged", () => {
    const raw = { version: 8, journals: { daily: { decorations: [movingDay] } }, calendar: { decorations: [] } };
    const before = structuredClone(raw);

    expect(v8ToV9Migration.migrate(raw)).toEqual(before);
  });

  it("runs in the chain to the current version", () => {
    const result = runMigrations({ version: 8 }, legacyMigrations, CURRENT_VERSION);

    expect(CURRENT_VERSION).toBe(9);
    expect(result.isOk() ? (result.value as { version: number }).version : undefined).toBe(9);
  });

  it("makes a version-8 reader refuse a version-9 file instead of loading and saving over it", () => {
    const result = runMigrations(
      { version: 9, calendar: { decorations: [movingDay] } },
      legacyMigrations.filter((migration) => migration !== v8ToV9Migration),
      8,
    );

    expect(result.isErr() ? result.error : undefined).toBeInstanceOf(SettingsTooNewError);
  });
});
