import * as v from "valibot";
import { describe, it, expect } from "vitest";

import type { AnchorString } from "@/calendar";

import { journalConfigSchema, journalDefaultsFor, navBlockSchema } from "./config";

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
  for (const type of ["day", "week", "month", "quarter", "year"] as const) {
    it(`accepts the unmodified defaults for a ${type} journal`, () => {
      const parsed = v.safeParse(journalConfigSchema, journalDefaultsFor({ type }, type));
      expect(parsed.success).toBe(true);
    });
  }

  it("accepts the unmodified defaults for a custom journal", () => {
    const cfg = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "custom",
    );
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(true);
  });

  it("accepts a config with the new fields populated", () => {
    const cfg = {
      ...journalDefaultsFor({ type: "day" }, "daily"),
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

describe("navBlockSchema", () => {
  it("accepts a populated nav block", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      rows: [
        {
          template: "{{date}}",
          fontSize: 1,
          bold: false,
          italic: false,
          color: { type: "theme" as const, name: "text-normal" },
          background: { type: "transparent" as const },
          link: "self" as const,
          journal: "",
          addDecorations: false,
        },
      ],
    };
    expect(v.safeParse(navBlockSchema, value).success).toBe(true);
  });

  it("rejects unknown link kinds", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      rows: [
        {
          template: "",
          fontSize: 1,
          bold: false,
          italic: false,
          color: { type: "transparent" as const },
          background: { type: "transparent" as const },
          link: "nonsense" as unknown as "self",
          journal: "",
          addDecorations: false,
        },
      ],
    };
    expect(v.safeParse(navBlockSchema, value).success).toBe(false);
  });
});
