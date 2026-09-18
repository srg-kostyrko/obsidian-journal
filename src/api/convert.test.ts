import { describe, expect, it } from "vitest";

import type { TypeId } from "@/journals/notelets/config";
import type { Prompt } from "@/journals/prompts/config";
import { buildNoteletType, customJournal, fixedJournal } from "@/journals/testing";

import { normalizeSelector, toCalendarDate, toJournalInfo } from "./convert";

function anchorOf(input: Parameters<typeof toCalendarDate>[0]): string | null {
  const parsed = toCalendarDate(input);
  return parsed.isSome() ? parsed.value.toAnchor() : null;
}

describe("toCalendarDate", () => {
  it("reads a JS Date in local time, ignoring its clock", () => {
    expect(anchorOf(new Date(2026, 7, 18, 23, 45))).toBe("2026-08-18");
  });

  it("accepts anything with toDate()", () => {
    expect(anchorOf({ toDate: () => new Date(2026, 0, 2) })).toBe("2026-01-02");
  });

  it("accepts a date expression string", () => {
    expect(anchorOf("2026-03-09")).toBe("2026-03-09");
  });

  it("accepts the relative grammar the URI handler uses", () => {
    expect(anchorOf("today")).not.toBeNull();
    expect(anchorOf("+1w")).not.toBe(anchorOf("today"));
  });

  it("returns none for a string it cannot read", () => {
    expect(anchorOf("whenever")).toBeNull();
  });

  it("returns none for an invalid Date", () => {
    expect(anchorOf(new Date(NaN))).toBeNull();
  });
});

describe("normalizeSelector", () => {
  it("treats a bare string as a journal name", () => {
    expect(normalizeSelector("Work Daily")).toEqual({ journal: "Work Daily" });
  });

  it("passes an object through, keeping an explicit null shelf", () => {
    expect(normalizeSelector({ writeType: "day", shelf: null })).toEqual({ writeType: "day", shelf: null });
  });

  it("treats undefined as matching everything", () => {
    expect(normalizeSelector(undefined)).toEqual({});
  });
});

describe("toJournalInfo", () => {
  it("flattens the empty-shelf sentinel to null", () => {
    expect(toJournalInfo("daily", fixedJournal("daily", { type: "day" }), "")).toEqual({
      name: "daily",
      shelf: null,
      write: { type: "day" },
      notelets: [],
      prompts: [],
      noteletTypes: [],
    });
  });

  it("carries interval data for a custom journal", () => {
    expect(toJournalInfo("sprint", customJournal("sprint", "week", 3, "2026-01-05"), "Work")).toEqual({
      name: "sprint",
      shelf: "Work",
      write: { type: "custom", every: "week", duration: 3 },
      notelets: [],
      prompts: [],
      noteletTypes: [],
    });
  });

  it("lists notelet type names in sorted order, not record order", () => {
    const config = fixedJournal(
      "daily",
      { type: "day" },
      {
        notelets: {
          nt_second: buildNoteletType({ id: "nt_second" as TypeId, name: "Meeting" }),
          nt_first: buildNoteletType({ id: "nt_first" as TypeId, name: "1o1" }),
        },
      },
    );

    expect(toJournalInfo("daily", config, "").notelets).toEqual(["1o1", "Meeting"]);
  });
});

describe("toJournalInfo questions", () => {
  const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };
  const place: Prompt = {
    variable: "place",
    question: "Where?",
    type: "select",
    frontmatterKey: "",
    required: true,
    options: [{ label: "Home", value: "home" }],
  };

  it("describes the journal's own questions", () => {
    const config = fixedJournal(
      "daily",
      { type: "day" },
      { nameTemplate: "{{date}} {{mood}}", prompts: [mood, place] },
    );

    expect(toJournalInfo("daily", config, "").prompts).toEqual([
      {
        variable: "mood",
        question: "Mood?",
        type: "text",
        required: false,
        inPath: true,
        multiline: false,
        options: [],
      },
      {
        variable: "place",
        question: "Where?",
        type: "select",
        required: true,
        inPath: false,
        multiline: false,
        options: [{ label: "Home", value: "home" }],
      },
    ]);
  });

  it("describes each notelet type's questions, sorted by name, leaving notelets as names", () => {
    const config = fixedJournal(
      "daily",
      { type: "day" },
      {
        notelets: {
          nt_b: buildNoteletType({ id: "nt_b" as TypeId, name: "Retro", prompts: [] }),
          nt_a: buildNoteletType({ id: "nt_a" as TypeId, name: "Meeting", prompts: [mood] }),
        },
      },
    );

    const info = toJournalInfo("daily", config, "");

    expect(info.notelets).toEqual(["Meeting", "Retro"]);
    expect(info.noteletTypes.map((type) => [type.name, type.prompts.map((prompt) => prompt.variable)])).toEqual([
      ["Meeting", ["mood"]],
      ["Retro", []],
    ]);
  });
});
