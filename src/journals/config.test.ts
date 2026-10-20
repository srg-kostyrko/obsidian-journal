import * as v from "valibot";
import { describe, it, expect } from "vitest";

import type { AnchorString } from "@/calendar";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { testContainer } from "@/testing";

import { journalConfigCollection, journalConfigSchema, journalDefaultsFor, navBlockSchema } from "./config";
import { journalsCoreModule } from "./module";
import { JournalsRepository } from "./repository";
import { buildNavSegment, buildNoteletType, fixedJournal, unwrap } from "./testing";

import type { JournalWrite } from "./config";

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

  it("defaults a journal to no prompts", () => {
    expect(journalDefaultsFor({ type: "day" }, "daily").prompts).toEqual([]);
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

  it("parses a stored journal that predates prompts", () => {
    const stored = { ...journalDefaultsFor({ type: "day" }, "daily") } as Record<string, unknown>;
    delete stored.prompts;
    const parsed = v.safeParse(journalConfigSchema, stored);
    expect(parsed.success && parsed.output.prompts).toEqual([]);
  });

  it("defaults tasks to empty providers and an empty listing filter for configs written before it existed", () => {
    const stored = { ...journalDefaultsFor({ type: "day" }, "daily") } as Record<string, unknown>;
    delete stored.tasks;
    const parsed = v.safeParse(journalConfigSchema, stored);
    expect(parsed.success && parsed.output.tasks).toEqual({ providers: {}, filter: { mode: "and", conditions: [] } });
  });

  it("keeps a per-journal checkbox rule", () => {
    const cfg = {
      ...journalDefaultsFor({ type: "day" }, "daily"),
      tasks: {
        providers: {
          checkbox: {
            compose: "replace",
            mode: "and",
            conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
          },
        },
      },
    };
    const parsed = v.parse(journalConfigSchema, cfg);
    expect(parsed.tasks.providers.checkbox?.compose).toBe("replace");
    expect(parsed.tasks.providers.checkbox?.conditions).toEqual([
      { type: "heading", condition: "under", headings: ["Tasks"] },
    ]);
  });

  it("splits a journal's tasks config into per-provider rules and a listing filter", () => {
    // journalConfigSchema also requires timeline/dateFormat/frontmatter/numbering, which the
    // brief's bare { name, write } literal omits — spread journalDefaultsFor to supply them, the
    // same way every other test in this file builds a parseable config.
    const parsed = v.parse(journalConfigSchema, journalDefaultsFor({ type: "day" }, "Daily"));
    expect(parsed.tasks).toEqual({ providers: {}, filter: { mode: "and", conditions: [] } });
  });

  it("keeps a stored provider rule and listing filter side by side", () => {
    const parsed = v.parse(journalConfigSchema, {
      ...journalDefaultsFor({ type: "day" }, "Daily"),
      tasks: {
        providers: { checkbox: { compose: "narrow", mode: "and", conditions: [] } },
        filter: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["## Tasks"] }] },
      },
    });
    expect(parsed.tasks.providers.checkbox?.compose).toBe("narrow");
    expect(parsed.tasks.filter.conditions).toHaveLength(1);
  });

  // Mirror of the above: a bad provider rule must not take a valid listing filter down with it.
  it("keeps a valid listing filter when a provider rule holds a condition type this version does not know", () => {
    const parsed = v.parse(journalConfigSchema, {
      ...journalDefaultsFor({ type: "day" }, "Daily"),
      tasks: {
        providers: { checkbox: { compose: "narrow", mode: "and", conditions: [{ type: "not-a-real-type" }] } },
        filter: { mode: "and", conditions: [{ type: "heading", condition: "under", headings: ["## Tasks"] }] },
      },
    });
    expect(parsed.tasks.providers).toEqual({});
    expect(parsed.tasks.filter.conditions).toHaveLength(1);
  });

  it("keeps a checkbox entry's dated-visibility rule beside its identification", () => {
    const checkbox = {
      compose: "inherit",
      mode: "and",
      conditions: [],
      dated: { show: "none", mode: "and", conditions: [] },
    };
    const parsed = v.parse(journalConfigSchema, {
      ...journalDefaultsFor({ type: "day" }, "Daily"),
      tasks: { providers: { checkbox } },
    });
    expect(parsed.tasks.providers.checkbox).toEqual(checkbox);
  });

  it("keeps a per-journal note-property visibility rule", () => {
    const rule = { show: "matching", mode: "or", conditions: [{ type: "folder", folders: ["Work"] }] };
    const parsed = v.parse(journalConfigSchema, {
      ...journalDefaultsFor({ type: "day" }, "Daily"),
      tasks: { providers: { "note-property": rule } },
    });
    expect(parsed.tasks.providers["note-property"]).toEqual(rule);
  });

  // Each provider key carries its own fallback: one around the namespace would reset the sibling
  // provider's rule along with the one that failed.
  it("keeps a valid checkbox rule when the note-property rule is unreadable", () => {
    const checkbox = { compose: "narrow", mode: "and", conditions: [] };
    const degraded = v.parse(journalConfigSchema, {
      ...journalDefaultsFor({ type: "day" }, "Daily"),
      tasks: {
        providers: { checkbox, "note-property": { show: "weird", conditions: [{ type: "not-a-real-type" }] } },
      },
    });
    expect(degraded.tasks.providers.checkbox).toEqual(checkbox);
    expect(degraded.tasks.providers["note-property"]).toEqual({ show: "all", mode: "and", conditions: [] });
  });

  it("keeps a valid note-property rule when the checkbox rule holds a condition type this version does not know", () => {
    const rule = { show: "none", mode: "and", conditions: [] };
    const parsed = v.parse(journalConfigSchema, {
      ...journalDefaultsFor({ type: "day" }, "Daily"),
      tasks: {
        providers: {
          checkbox: { compose: "narrow", mode: "and", conditions: [{ type: "not-a-real-type" }] },
          "note-property": rule,
        },
      },
    });
    expect(parsed.tasks.providers.checkbox).toBeUndefined();
    expect(parsed.tasks.providers["note-property"]).toEqual(rule);
  });

  it("accepts an unset end date, so a half-configured timeline survives a reload", () => {
    const cfg = {
      ...journalDefaultsFor({ type: "day" }, "daily"),
      timeline: { start: "" as AnchorString, end: { kind: "date", date: "" } },
    };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed end date", () => {
    const cfg = {
      ...journalDefaultsFor({ type: "day" }, "daily"),
      timeline: { start: "" as AnchorString, end: { kind: "date", date: "not-a-date" } },
    };
    const parsed = v.safeParse(journalConfigSchema, cfg);
    expect(parsed.success).toBe(false);
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
  it.each(["day", "week", "month", "quarter", "year", "custom"] as const)(
    "shows the adjacent periods by default for a %s journal",
    (type) => {
      expect(journalDefaultsFor({ type } as JournalWrite, "journal").navBlock.showAdjacent).toBe("all");
    },
  );

  it("day journal has weekday + big day-number + relative + week + month + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "day" }, "daily");
    expect(navBlock.type).toBe("create");
    expect(navBlock.decorateWholeBlock).toBe(false);
    expect(navBlock.lines.map((line) => line[0]?.template)).toEqual([
      "{{date:ddd}}",
      "{{date:D}}",
      "{{relative_date}}",
      "{{date:[W]w}}",
      "{{date:MMMM}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.lines[1]?.[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("week journal has big week + relative + month + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "week" }, "weekly");
    expect(navBlock.lines.map((line) => line[0]?.template)).toEqual([
      "{{date:[W]w}}",
      "{{relative_date}}",
      "{{date:MMMM}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.lines[0]?.[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("month journal has big month + relative + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "month" }, "monthly");
    expect(navBlock.lines.map((line) => line[0]?.template)).toEqual([
      "{{date:MMMM}}",
      "{{relative_date}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.lines[0]?.[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("quarter journal has big quarter + relative + year rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "quarter" }, "quarterly");
    expect(navBlock.lines.map((line) => line[0]?.template)).toEqual([
      "{{date:[Q]Q}}",
      "{{relative_date}}",
      "{{date:YYYY}}",
    ]);
    expect(navBlock.lines[0]?.[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("year journal has big year + relative rows", () => {
    const { navBlock } = journalDefaultsFor({ type: "year" }, "yearly");
    expect(navBlock.lines.map((line) => line[0]?.template)).toEqual(["{{date:YYYY}}", "{{relative_date}}"]);
    expect(navBlock.lines[0]?.[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
  });

  it("custom journal has big title + start_date + 'to' + end_date rows", () => {
    const { navBlock } = journalDefaultsFor(
      { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString },
      "biweekly",
    );
    expect(navBlock.lines.map((line) => line[0]?.template)).toEqual([
      "{{journal_name}} {{index}}",
      "{{start_date}}",
      "to",
      "{{end_date}}",
    ]);
    expect(navBlock.lines[0]?.[0]).toMatchObject({ fontSize: 3, bold: true, link: "self", addDecorations: true });
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
    expect(intervalBlock.lines.map((line) => line[0]?.template)).toEqual([
      "{{journal_name}} {{index}}",
      "{{start_date}} to {{end_date}}",
    ]);
    expect(intervalBlock.lines[0]?.[0]).toMatchObject({ fontSize: 1.2, bold: true, link: "self" });
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
      lines: [],
      decorateWholeBlock: false,
      showAdjacent: "all",
    });
  });
});

describe("journalConfigSchema intervalBlock default", () => {
  it("seeds intervalBlock to empty-create when journalDefaultsFor is used", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    expect(cfg.intervalBlock).toEqual({
      type: "create",
      lines: [],
      decorateWholeBlock: false,
      showAdjacent: "all",
    });
  });

  it("fills intervalBlock with the empty-create default when absent from input", () => {
    const cfg = journalDefaultsFor({ type: "day" }, "daily");
    const { intervalBlock: _omit, ...withoutIntervalBlock } = cfg;
    const parsed = v.parse(journalConfigSchema, withoutIntervalBlock);
    expect(parsed.intervalBlock).toEqual({
      type: "create",
      lines: [],
      decorateWholeBlock: false,
      showAdjacent: "all",
    });
  });
});

describe("navBlockSchema", () => {
  it("accepts a populated nav block and defaults a missing linkDate to empty string", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      lines: [
        [
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
      ],
    };
    const parsed = v.safeParse(navBlockSchema, value);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.output.lines[0]?.[0]?.linkDate).toBe("");
  });

  it("accepts a segment with linkDate explicitly present", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      lines: [
        [
          {
            template: "{{date}}",
            fontSize: 1,
            bold: false,
            italic: false,
            color: { type: "theme" as const, name: "text-normal" },
            background: { type: "transparent" as const },
            link: "self" as const,
            journal: "",
            linkDate: "",
            addDecorations: false,
          },
        ],
      ],
    };
    const parsed = v.safeParse(navBlockSchema, value);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.output.lines[0]?.[0]?.linkDate).toBe("");
  });

  it.each(["all", "desktop", "mobile", "none"] as const)("keeps a stored showAdjacent of %s", (stored) => {
    const value = { type: "create" as const, decorateWholeBlock: false, lines: [], showAdjacent: stored };
    const parsed = v.safeParse(navBlockSchema, value);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.output.showAdjacent).toBe(stored);
  });

  it("rejects an unknown showAdjacent so the repair walk can default it", () => {
    const value = { type: "create" as const, decorateWholeBlock: false, lines: [], showAdjacent: "tablet" };
    expect(v.safeParse(navBlockSchema, value).success).toBe(false);
  });

  it("rejects unknown link kinds", () => {
    const value = {
      type: "create" as const,
      decorateWholeBlock: false,
      lines: [
        [
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
      ],
    };
    expect(v.safeParse(navBlockSchema, value).success).toBe(false);
  });
});

describe("journalConfigCollection default item", () => {
  it("keeps the stored write type so a journal that fails validation stays its own kind", () => {
    const item = journalConfigCollection.defaultItem("Journal weekly", { write: { type: "week" } });

    expect(item.write).toEqual({ type: "week" });
    expect(item.dateFormat).toBe("YYYY-[W]w");
  });

  it("keeps a stored custom write type with its interval", () => {
    const item = journalConfigCollection.defaultItem("Sprints", {
      write: { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" },
    });

    expect(item.write).toEqual({ type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" });
  });

  it("falls back to day when the stored write type is unusable", () => {
    const item = journalConfigCollection.defaultItem("Broken", { write: { type: "fortnight" } });

    expect(item.write).toEqual({ type: "day" });
    expect(item.name).toBe("Broken");
  });
});

describe("journalDefaultsFor identity between journals", () => {
  it("gives two day journals separate navBlock and decorations objects", () => {
    const first = journalDefaultsFor({ type: "day" }, "a");
    const second = journalDefaultsFor({ type: "day" }, "b");

    expect(first.navBlock).not.toBe(second.navBlock);
    expect(first.decorations).not.toBe(second.decorations);
  });

  it("gives two week journals separate intervalBlock objects", () => {
    const first = journalDefaultsFor({ type: "week" }, "a");
    const second = journalDefaultsFor({ type: "week" }, "b");

    expect(first.intervalBlock).not.toBe(second.intervalBlock);
  });

  it("gives two custom journals separate navBlock, decorations and intervalBlock objects", () => {
    const write: JournalWrite = {
      type: "custom",
      every: "week",
      duration: 2,
      anchorDate: "2024-01-01" as AnchorString,
    };
    const first = journalDefaultsFor(write, "a");
    const second = journalDefaultsFor(write, "b");

    expect(first.navBlock).not.toBe(second.navBlock);
    expect(first.decorations).not.toBe(second.decorations);
    expect(first.intervalBlock).not.toBe(second.intervalBlock);
  });

  it("does not leak a mutation to one journal's navBlock into a journal created afterwards", () => {
    const first = journalDefaultsFor({ type: "day" }, "a");
    const second = journalDefaultsFor({ type: "day" }, "b");
    const before = second.navBlock.lines.length;

    first.navBlock.lines.push([]);

    expect(second.navBlock.lines).toHaveLength(before);
  });

  it("does not leak a mutation to one journal's decorations into a journal created afterwards", () => {
    const first = journalDefaultsFor({ type: "day" }, "a");
    const second = journalDefaultsFor({ type: "day" }, "b");
    const before = second.decorations.length;

    first.decorations.push(first.decorations[0]);

    expect(second.decorations).toHaveLength(before);
  });

  it("does not leak a mutation to one journal's intervalBlock into a journal created afterwards", () => {
    const write: JournalWrite = {
      type: "custom",
      every: "week",
      duration: 2,
      anchorDate: "2024-01-01" as AnchorString,
    };
    const first = journalDefaultsFor(write, "a");
    const second = journalDefaultsFor(write, "b");
    const before = second.intervalBlock.lines.length;

    first.intervalBlock.lines.push([]);

    expect(second.intervalBlock.lines).toHaveLength(before);
  });
});

const seededLines = () => [
  [buildNavSegment({ template: "a" }), buildNavSegment({ template: "b" })],
  [buildNavSegment({ template: "c" }), buildNavSegment({ template: "d", link: "week" })],
];

describe("journal nav block repair on load", () => {
  it("a journal's nav block keeps its other segments when one link is unknown", async () => {
    const stored = fixedJournal(
      "daily",
      { type: "day" },
      {
        navBlock: {
          ...journalDefaultsFor({ type: "day" }, "daily").navBlock,
          lines: seededLines(),
          decorateWholeBlock: true,
          showAdjacent: "desktop",
        },
      },
    );
    const raw = structuredClone(stored);
    (raw.navBlock.lines[1]?.[1] as { link: string }).link = "fortnight";
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: raw } },
      allow: { dataRepair: true },
    });

    const { navBlock } = unwrap(harness.resolve(JournalsRepository).get("daily"));
    const expected = structuredClone(stored.navBlock);
    (expected.lines[1]?.[1] as { link: string }).link = "none";
    expect(navBlock).toEqual(expected);
  });

  it("an unknown showAdjacent resets only showAdjacent", async () => {
    const base = journalDefaultsFor({ type: "day" }, "daily").navBlock;
    const raw = fixedJournal("daily", { type: "day" }, { navBlock: { ...base, lines: seededLines() } });
    (raw.navBlock as { showAdjacent: string }).showAdjacent = "tablet";
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: raw } },
      allow: { dataRepair: true },
    });

    const { navBlock } = unwrap(harness.resolve(JournalsRepository).get("daily"));
    expect(navBlock.showAdjacent).toBe("all");
    expect(navBlock.lines).toEqual(seededLines());
    const repair = harness.logs.records.find(
      (record) => record.message === "collection entry fields reset to defaults",
    );
    expect(repair?.fields).toMatchObject({ fields: ["navBlock.showAdjacent"] });
  });
});

async function loadTasks(tasks: unknown) {
  const raw = fixedJournal("daily", { type: "day" }, { tasks: tasks as never });
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { daily: raw } },
    allow: { dataRepair: true },
  });
  const repair = harness.logs.records.find((record) => record.message === "collection entry fields reset to defaults");
  return { tasks: unwrap(harness.resolve(JournalsRepository).get("daily")).tasks, repair };
}

describe("journal tasks repair on load", () => {
  const checkbox = { compose: "narrow", mode: "and", conditions: [] };
  const heading = { type: "heading", condition: "under", headings: ["## Tasks"] };

  it("a provider namespace that is not an object reads as no provider rules, keeping the filter", async () => {
    const { tasks, repair } = await loadTasks({ providers: "garbage", filter: { mode: "or", conditions: [heading] } });

    expect(tasks).toEqual({ providers: {}, filter: { mode: "or", conditions: [heading] } });
    expect(repair?.fields).toMatchObject({ fields: ["tasks.providers"] });
  });

  it("an unreadable note-property rule is dropped alone, keeping the checkbox rule", async () => {
    const { tasks, repair } = await loadTasks({ providers: { checkbox, "note-property": 42 } });

    expect(tasks.providers).toEqual({ checkbox });
    expect(repair?.fields).toMatchObject({ fields: ["tasks.providers.note-property"] });
  });

  // The live path: a vault synced from a newer version holds a condition type this one does not know.
  it("a listing filter condition of an unknown type is dropped alone, keeping the filter's other conditions", async () => {
    const { tasks, repair } = await loadTasks({
      providers: { checkbox },
      filter: { mode: "or", conditions: [heading, { type: "not-a-real-type" }] },
    });

    expect(tasks).toEqual({ providers: { checkbox }, filter: { mode: "or", conditions: [heading] } });
    expect(repair?.fields).toMatchObject({ fields: ["tasks.filter.conditions.1"] });
  });

  it("a listing filter whose only condition is unreadable keeps no condition, and the provider rule stays", async () => {
    const { tasks, repair } = await loadTasks({
      providers: { checkbox },
      filter: { mode: "and", conditions: [{ type: "not-a-real-type" }] },
    });

    expect(tasks).toEqual({ providers: { checkbox }, filter: { mode: "and", conditions: [] } });
    expect(repair?.fields).toMatchObject({ fields: ["tasks.filter.conditions"] });
  });

  it("an unreadable listing filter mode resets to and, keeping the conditions", async () => {
    const { tasks, repair } = await loadTasks({
      providers: { checkbox },
      filter: { mode: "xor", conditions: [heading] },
    });

    expect(tasks).toEqual({ providers: { checkbox }, filter: { mode: "and", conditions: [heading] } });
    expect(repair?.fields).toMatchObject({ fields: ["tasks.filter.mode"] });
  });
});

async function loadJournal(raw: unknown): Promise<ReturnType<JournalsRepository["get"]>> {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { daily: raw } },
    allow: { dataRepair: true },
  });
  return harness.resolve(JournalsRepository).get("daily");
}

async function loadJournalLogged(raw: unknown) {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { daily: raw } },
    allow: { dataRepair: true },
  });
  const repair = harness.logs.records.find((record) => record.message === "collection entry fields reset to defaults");
  return { journal: unwrap(harness.resolve(JournalsRepository).get("daily")), repair };
}

const keptDecoration = () =>
  buildDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [1] })],
    styles: [buildStyle("color")],
  });

describe("journal decoration repair on load", () => {
  it.each([
    ["an unknown condition type", { type: "moon-phase" }],
    [
      "a note-size condition with a negative threshold",
      { type: "note-size", unit: "words", condition: "gt", value: -1 },
    ],
  ])("a decoration with %s is dropped whole, keeping its sibling", async (_label, bad) => {
    const broken = buildDecoration({
      conditions: [buildCondition("has-note"), bad as never],
      styles: [buildStyle("color")],
    });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [broken, keptDecoration()] });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.decorations).toEqual([keptDecoration()]);
  });

  it.each([
    ["quantifier", "most"],
    ["date", "someday"],
    ["filter", { mode: "xor", conditions: [] }],
  ])("a tasks condition with an unreadable %s drops its decoration, keeping its sibling", async (field, bad) => {
    const broken = buildDecoration({
      conditions: [{ ...buildCondition("tasks"), [field]: bad }],
      styles: [buildStyle("color")],
    });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [broken, keptDecoration()] });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: raw } },
      allow: { dataRepair: true },
    });

    expect(unwrap(harness.resolve(JournalsRepository).get("daily")).decorations).toEqual([keptDecoration()]);
    const repair = harness.logs.records.find(
      (record) => record.message === "collection entry fields reset to defaults",
    );
    expect(repair?.fields).toMatchObject({ fields: ["decorations.0"] });
  });

  it("a journal whose only decoration has a bad condition keeps no decoration, not the seeded default", async () => {
    const broken = buildDecoration({ conditions: [{ type: "moon-phase" } as never], styles: [buildStyle("color")] });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [broken] });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.decorations).toEqual([]);
  });

  it("a style with an unknown type is dropped, keeping the decoration's conditions and other styles", async () => {
    const decoration = buildDecoration({
      conditions: [buildCondition("has-note")],
      styles: [{ type: "glow", radius: 2 } as never, buildStyle("shape")],
    });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [decoration, keptDecoration()] });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.decorations).toEqual([{ ...decoration, styles: [buildStyle("shape")] }, keptDecoration()]);
  });

  it("a style with one unreadable color resets only that color", async () => {
    const shape = buildStyle("shape", { size: 0.8, shape: "square", placement_x: "left", placement_y: "top" });
    const decoration = buildDecoration({
      conditions: [buildCondition("has-note")],
      styles: [{ ...shape, color: { type: "custom", color: 5 } } as never, buildStyle("background")],
    });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [decoration] });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.decorations).toEqual([
      { ...decoration, styles: [{ ...shape, color: buildStyle("shape").color }, buildStyle("background")] },
    ]);
  });

  it("a background style with an unreadable color is dropped, keeping the other styles and the conditions", async () => {
    const decoration = buildDecoration({
      conditions: [buildCondition("has-note")],
      styles: [{ type: "background", color: { type: "custom", color: 5 } } as never, buildStyle("shape")],
    });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [decoration] });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.decorations).toEqual([{ ...decoration, styles: [buildStyle("shape")] }]);
  });

  it("a border side whose visibility is unreadable is hidden, leaving the other sides alone", async () => {
    const visible = { show: true, width: 2, color: { type: "custom", color: "#ff0000" }, style: "dashed" } as const;
    const border = buildStyle("border", { border: "different", left: visible, right: visible, top: visible });
    const decoration = buildDecoration({
      conditions: [buildCondition("has-note")],
      styles: [{ ...border, bottom: { ...visible, show: "yes" } } as never],
    });
    const raw = fixedJournal("daily", { type: "day" }, { decorations: [decoration] });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.decorations).toEqual([
      { ...decoration, styles: [{ ...border, bottom: { ...visible, show: false } }] },
    ]);
  });
});

const configuredNoteletType = () =>
  buildNoteletType({
    id: "nt_1" as never,
    name: "Meeting",
    folder: "Meetings",
    templates: ["t.md"],
    counter: { enabled: false, frontmatterKey: "meeting-index" },
    confirmCreation: true,
  });

describe("journal notelet type repair on load", () => {
  it.each([
    ["prompts", { prompts: [{ type: "moon", variable: "m", question: "M?", frontmatterKey: "m" }] }],
    ["templates", { templates: [5] }],
  ])("a notelet type whose only %s item is unreadable empties that list and keeps the rest", async (field, bad) => {
    const raw = fixedJournal(
      "daily",
      { type: "day" },
      { notelets: { nt_1: { ...configuredNoteletType(), ...(bad as object) } } },
    );

    const journal = unwrap(await loadJournal(raw));

    expect(journal.notelets.nt_1).toEqual({ ...configuredNoteletType(), [field]: [] });
  });
});

const askedPrompts = () => [
  { type: "text", variable: "mood", question: "Mood?", frontmatterKey: "mood", required: false },
  { type: "number", variable: "sleep", question: "Hours slept?", frontmatterKey: "sleep", required: true },
];

const twoSources = () => [
  { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
  { variable: "lap", frontmatterKey: "journal-lap", anchorValue: 3, reset: { kind: "after", count: 4 } },
];

const numberedJournal = () =>
  fixedJournal(
    "daily",
    { type: "day" },
    {
      frontmatter: {
        dateField: "date",
        startDateField: "from",
        endDateField: "to",
        noteletField: "kind",
        addStartDate: true,
        addEndDate: true,
      },
      numbering: {
        enabled: true,
        anchorDate: "2024-01-01" as AnchorString,
        allowBefore: true,
        sources: twoSources() as never,
      },
      prompts: askedPrompts() as never,
    },
  );

describe("journal prompt, numbering and frontmatter repair on load", () => {
  it("a prompt with an unknown type is dropped, keeping the other prompt and every other field", async () => {
    const stored = numberedJournal();
    const raw = structuredClone(stored);
    (raw.prompts as unknown[]).unshift({ type: "slider", variable: "x", question: "X?", frontmatterKey: "x" });

    const journal = unwrap(await loadJournal(raw));

    expect(journal).toEqual(stored);
  });

  it("a numbering source with an unreadable reset is dropped, keeping the other source", async () => {
    const stored = numberedJournal();
    const raw = structuredClone(stored);
    (raw.numbering.sources[1] as { reset: unknown }).reset = { kind: "after", count: 0 };

    const journal = unwrap(await loadJournal(raw));

    expect(journal).toEqual({ ...stored, numbering: { ...stored.numbering, sources: [twoSources()[0]] } });
  });

  // Each of these flags rewrites notes when it changes: a false add flag strips the derived date
  // from every note the journal writes, and allowBefore decides whether earlier notes are numbered.
  it.each([
    ["numbering", "allowBefore"],
    ["frontmatter", "addStartDate"],
    ["frontmatter", "addEndDate"],
  ] as const)("an unreadable %s.%s resets only that flag to false and logs it", async (group, flag) => {
    const stored = numberedJournal();
    const raw = structuredClone(stored);
    (raw[group] as Record<string, unknown>)[flag] = "yes";

    const { journal, repair } = await loadJournalLogged(raw);

    expect(journal).toEqual({ ...stored, [group]: { ...stored[group], [flag]: false } });
    expect(repair?.fields).toMatchObject({ fields: [`${group}.${flag}`] });
  });

  // A numbering source writes its counter under this key; any default would start a second
  // count beside the notes already carrying the first.
  it("a numbering source with an unreadable frontmatter key is dropped rather than given a default key", async () => {
    const stored = numberedJournal();
    const raw = structuredClone(stored);
    (raw.numbering.sources[1] as { frontmatterKey: unknown }).frontmatterKey = "";

    const journal = unwrap(await loadJournal(raw));

    expect(journal.numbering.sources).toEqual([twoSources()[0]]);
  });

  // The variable is what templates and stored answers are keyed by.
  it("a prompt with an unreadable variable is dropped rather than given a default variable", async () => {
    const stored = numberedJournal();
    const raw = structuredClone(stored);
    (raw.prompts[1] as { variable: unknown }).variable = 7;

    const journal = unwrap(await loadJournal(raw));

    expect(journal.prompts).toEqual([askedPrompts()[0]]);
  });
});

describe("journal select prompt repair on load", () => {
  it("a select option with an empty label is dropped, keeping the question and its other options", async () => {
    const select = {
      type: "select",
      variable: "place",
      question: "Where?",
      frontmatterKey: "place",
      required: false,
      options: [
        { label: "Home", value: "home" },
        { label: "", value: "office" },
      ],
    };
    const raw = fixedJournal("daily", { type: "day" }, { prompts: [select] as never });

    const journal = unwrap(await loadJournal(raw));

    expect(journal.prompts).toEqual([{ ...select, options: [{ label: "Home", value: "home" }] }]);
  });
});

describe("journal notelet counter repair on load", () => {
  it("an unreadable counter flag resets only the flag, keeping the type's own counter key", async () => {
    const raw = fixedJournal("daily", { type: "day" }, {
      notelets: { nt_1: { ...configuredNoteletType(), counter: { enabled: "no", frontmatterKey: "meeting-index" } } },
    } as never);

    const journal = unwrap(await loadJournal(raw));

    expect(journal.notelets.nt_1?.counter).toEqual({ enabled: true, frontmatterKey: "meeting-index" });
  });
});

describe("journal write repair on load", () => {
  const customWrite = { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" as AnchorString } as const;

  it.each([
    ["duration", 0],
    ["every", "fortnight"],
    ["anchorDate", "soon"],
  ] as const)("a custom write with an unreadable %s falls to the journal default as a whole", async (key, bad) => {
    const stored = fixedJournal("daily", customWrite, { folder: "Sprints" });
    const raw = structuredClone(stored);
    (raw.write as Record<string, unknown>)[key] = bad;

    const { journal, repair } = await loadJournalLogged(raw);

    expect(journal.write).toEqual({ type: "day" });
    expect(journal.folder).toBe("Sprints");
    expect(repair?.fields).toMatchObject({ fields: ["write"] });
  });
});
