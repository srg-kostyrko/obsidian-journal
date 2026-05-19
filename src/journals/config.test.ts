import * as v from "valibot";
import { describe, it, expect } from "vitest";

import { journalConfigSchema, journalDefaultsFor } from "./config";

describe("journalDefaultsFor", () => {
  it("defaults nameTemplate to {{date}}", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.nameTemplate).toBe("{{date}}");
  });

  it("defaults folder to empty string", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.folder).toBe("");
  });

  it("defaults templates to empty array", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.templates).toEqual([]);
  });

  it("defaults confirmCreation to false", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.confirmCreation).toBe(false);
  });

  it("defaults autoCreate to false", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.autoCreate).toBe(false);
  });
});

describe("journalConfigSchema", () => {
  it("accepts a config with the new fields populated", () => {
    const cfg = {
      ...journalDefaultsFor({ type: "day" }, "daily"),
      timeline: { start: "2024-01-01", end: { kind: "never" as const } },
      numbering: {
        enabled: false,
        anchorDate: "2024-01-01",
        allowBefore: false,
        sources: [],
      },
      nameTemplate: "diary-{{date}}",
      folder: "Diary/{{date:YYYY}}",
      templates: ["Templates/daily.md"],
      confirmCreation: true,
      autoCreate: true,
    };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(true);
  });

  it("rejects a config whose nameTemplate is not a string", () => {
    const cfg = { ...journalDefaultsFor({ type: "day" }, "daily"), nameTemplate: 123 };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(false);
  });

  it("rejects a config whose templates is not an array of strings", () => {
    const cfg = { ...journalDefaultsFor({ type: "day" }, "daily"), templates: [42] };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(false);
  });
});
