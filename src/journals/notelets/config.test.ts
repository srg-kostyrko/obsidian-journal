import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { journalsCoreModule } from "../module";
import { JournalsRepository } from "../repository";
import { fixedJournal, buildNoteletType, unwrap } from "../testing";

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
