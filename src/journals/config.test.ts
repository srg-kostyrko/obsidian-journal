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

describe("journalDefaultsFor navBlock per write type", () => {
  it("day journal has weekday + big day-number + relative + week + month + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "day" }, "daily");
    expect(navBlock.type).toBe("create");
    expect(navBlock.decorateWholeBlock).toBe(false);
    expect(navBlock.rows.map((r) => r.template)).toEqual([
      "{{date:ddd}}",
      "{{date:D}}",
      "{{relative_date}}",
      "{{date:[W]w}}",
      "{{date:MMMM}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.rows[1]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("week journal has big week + relative + month + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "week" }, "weekly");
    expect(navBlock.rows.map((r) => r.template)).toEqual([
      "{{date:[W]w}}",
      "{{relative_date}}",
      "{{date:MMMM}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("month journal has big month + relative + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "month" }, "monthly");
    expect(navBlock.rows.map((r) => r.template)).toEqual(["{{date:MMMM}}", "{{relative_date}}", "{{date:YYYY}}"]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("quarter journal has big quarter + relative + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "quarter" }, "quarterly");
    expect(navBlock.rows.map((r) => r.template)).toEqual(["{{date:[Q]Q}}", "{{relative_date}}", "{{date:YYYY}}"]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("year journal has big year + relative rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "year" }, "yearly");
    expect(navBlock.rows.map((r) => r.template)).toEqual(["{{date:YYYY}}", "{{relative_date}}"]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("custom journal has big title + start_date + 'to' + end_date rows", () => {
    const { navBlock } = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "biweekly",
    );
    expect(navBlock.rows.map((r) => r.template)).toEqual([
      "{{journal_name}} {{index}}",
      "{{start_date}}",
      "to",
      "{{end_date}}",
    ]);
    expect(navBlock.rows[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });
});

describe("journalDefaultsFor custom-interval defaults", () => {
  const customWrite = { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString } as const;

  it("names notes by journal name and index", () => {
    const cfg = journalDefaultsFor(customWrite, "biweekly");
    expect(cfg.nameTemplate).toBe("{{journal_name}} {{index}}");
  });

  it("starts the timeline at the cycle anchor date", () => {
    const cfg = journalDefaultsFor(customWrite, "biweekly");
    expect(cfg.timeline.start).toBe("2024-01-01");
  });

  it("seeds the interval block with a title row and a start-to-end row", () => {
    const { intervalBlock } = journalDefaultsFor(customWrite, "biweekly");
    expect(intervalBlock.type).toBe("create");
    expect(intervalBlock.decorateWholeBlock).toBe(true);
    expect(intervalBlock.rows.map((r) => r.template)).toEqual([
      "{{journal_name}} {{index}}",
      "{{start_date}} to {{end_date}}",
    ]);
    expect(intervalBlock.rows[0]).toMatchObject({ fontSize: 1.2, bold: true, link: "self" });
  });

  it("seeds a left-border accent decoration for notes that exist", () => {
    const cfg = journalDefaultsFor(customWrite, "biweekly");
    expect(cfg.decorations).toHaveLength(1);
    const [decoration] = cfg.decorations;
    expect(decoration.conditions).toEqual([{ type: "has-note" }]);
    expect(decoration.styles[0]).toMatchObject({
      type: "border",
      border: "different",
      left: { show: true, width: 2, color: { type: "theme", name: "interactive-accent" } },
    });
  });
});

describe("journalDefaultsFor fixed-interval decorations", () => {
  it("seeds an accent circle decoration for notes that exist", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.decorations).toHaveLength(1);
    const [decoration] = cfg.decorations;
    expect(decoration.conditions).toEqual([{ type: "has-note" }]);
    expect(decoration.styles[0]).toMatchObject({
      type: "shape",
      shape: "circle",
      color: { type: "theme", name: "interactive-accent" },
    });
  });
});

describe("journalConfigSchema navBlock default", () => {
  it("fills navBlock with an empty-create default when absent", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    const { navBlock: _omit, ...withoutNavBlock } = cfg;
    const parsed = v.parse(journalConfigSchema, withoutNavBlock);
    expect(parsed.navBlock).toEqual({
      type: "create",
      rows: [],
      decorateWholeBlock: false,
    });
  });
});

describe("journalConfigSchema intervalBlock default", () => {
  it("seeds intervalBlock to empty-create when journalDefaultsFor is used", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.intervalBlock).toEqual({
      type: "create",
      rows: [],
      decorateWholeBlock: false,
    });
  });

  it("fills intervalBlock with the empty-create default when absent from input", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    const { intervalBlock: _omit, ...withoutIntervalBlock } = cfg;
    const parsed = v.parse(journalConfigSchema, withoutIntervalBlock);
    expect(parsed.intervalBlock).toEqual({
      type: "create",
      rows: [],
      decorateWholeBlock: false,
    });
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
