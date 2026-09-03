import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { journalsCoreModule } from "../module";
import { JournalsRepository } from "../repository";
import { fixedJournal, buildNoteletType, unwrap } from "../testing";

import { noteletTypeByName } from "./config";

import type { JournalConfig } from "../config";
import type { NoteletType, TypeId } from "./config";

describe("notelet type configuration", () => {
  it("defaults a journal to no notelet types", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    expect(unwrap(harness.resolve(JournalsRepository).get("daily")).notelets).toEqual({});
  });

  it("defaults the type key to journal-notelet", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    expect(unwrap(harness.resolve(JournalsRepository).get("daily")).frontmatter.noteletField).toBe("journal-notelet");
  });

  it("keeps a sibling type when one type's name fails validation", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: {
            ...fixedJournal("daily", { type: "day" }),
            notelets: {
              nt_bad: { ...buildNoteletType({ id: "nt_bad" as never }), name: "" },
              nt_good: buildNoteletType({ id: "nt_good" as never, name: "Standup" }),
            },
          },
        },
      },
      allow: { dataRepair: true },
    });

    const config = unwrap(harness.resolve(JournalsRepository).get("daily"));
    expect(config.notelets.nt_good?.name).toBe("Standup");
    expect(config.notelets.nt_bad?.name).not.toBe("");
  });

  it("keeps the journal's own fields when a type fails validation", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: {
            ...fixedJournal("daily", { type: "day" }, { folder: "Journal/Daily" }),
            notelets: { nt_bad: { ...buildNoteletType({ id: "nt_bad" as never }), name: "" } },
          },
        },
      },
      allow: { dataRepair: true },
    });

    expect(unwrap(harness.resolve(JournalsRepository).get("daily")).folder).toBe("Journal/Daily");
  });
});

function journalWith(types: Record<string, Partial<NoteletType>>): JournalConfig {
  return fixedJournal(
    "Work",
    { type: "day" },
    {
      notelets: Object.fromEntries(
        Object.entries(types).map(([key, overrides]) => [key, buildNoteletType({ id: key as TypeId, ...overrides })]),
      ),
    },
  );
}

describe("noteletTypeByName", () => {
  it("finds a type by its display name and returns the record key as the id", () => {
    const found = noteletTypeByName(journalWith({ nt_a: { name: "Meeting" } }), "Meeting");

    expect(found.isSome()).toBe(true);
    expect(unwrap(found)[0]).toBe("nt_a");
    expect(unwrap(found)[1].name).toBe("Meeting");
  });

  it("returns the record key even when the stored id field disagrees", () => {
    const config = journalWith({ nt_a: { name: "Meeting", id: "nt_stale" as TypeId } });

    expect(config.notelets.nt_a?.id).toBe("nt_stale");
    expect(unwrap(noteletTypeByName(config, "Meeting"))[0]).toBe("nt_a");
  });

  it("is none for an unknown name", () => {
    expect(noteletTypeByName(journalWith({ nt_a: { name: "Meeting" } }), "Standup").isNone()).toBe(true);
  });

  it("is none for a journal with no types", () => {
    expect(noteletTypeByName(journalWith({}), "Meeting").isNone()).toBe(true);
  });

  it("matches the name exactly, not case-insensitively", () => {
    expect(noteletTypeByName(journalWith({ nt_a: { name: "Meeting" } }), "meeting").isNone()).toBe(true);
  });
});
