import { describe, expect, it } from "vitest";

import { v2ToV3Migration } from "./v2-to-v3";

describe("v2ToV3Migration", () => {
  it("targets version 2 -> 3", () => {
    expect(v2ToV3Migration.fromVersion).toBe(2);
    expect(v2ToV3Migration.toVersion).toBe(3);
  });

  it("back-fills commands when absent", () => {
    const out = v2ToV3Migration.migrate({ version: 2 });
    expect(Array.isArray(out.commands)).toBe(true);
    expect((out.commands as unknown[]).length).toBeGreaterThan(0);
  });

  it("back-fills per-shelf commands and dismissedNotifications", () => {
    const out = v2ToV3Migration.migrate({ version: 2, shelves: { a: { name: "a", journals: [] } } });
    expect((out.shelves as Record<string, { commands: unknown[] }>).a.commands).toEqual([]);
    expect(out.dismissedNotifications).toEqual([]);
  });

  it("preserves existing commands", () => {
    const existing = [{ name: "keep" }];
    const out = v2ToV3Migration.migrate({ version: 2, commands: existing });
    expect(out.commands).toBe(existing);
  });
});
