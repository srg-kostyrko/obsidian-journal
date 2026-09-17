import { describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { OutOfTimelineError } from "../errors";
import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { JournalNoteLinkCancelledError, NamedByAnswersError } from "./errors";
import { JournalNoteLinkPicker } from "./journal-note-link";

import type { Prompt } from "./config";

const tick = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

function dailyIn(folder: string) {
  return fixedJournal("daily", { type: "day" }, { folder });
}

async function pickDay(harness: TestHarness, day: string) {
  const picked = harness.resolve(JournalNoteLinkPicker).pick();
  await tick();
  harness.modals.lastOpen().submit(DayPeriod.containing(date(day)));
  return picked;
}

describe("JournalNoteLinkPicker", () => {
  it("links a note that does not exist yet by its full path, without asking which journal when there is one", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dailyIn("Daily") } },
    });

    const result = await pickDay(harness, "2026-01-01");

    expectOk(result);
    expect(result.value).toBe("Daily/2026-01-01");
  });

  it("links an existing note by its link text", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dailyIn("Daily") } },
    });
    harness.host.putFile("Daily/2026-01-01.md");

    const result = await pickDay(harness, "2026-01-01");

    expectOk(result);
    expect(result.value).toBe("2026-01-01");
  });

  it("asks which journal when there are several, and links that journal's period", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: dailyIn("Daily"),
          weekly: fixedJournal("weekly", { type: "week" }, { folder: "Weekly" }),
        },
      },
    });

    const picked = harness.resolve(JournalNoteLinkPicker).pick();
    await tick();
    harness.suggests.lastOpen().choose("weekly");
    await tick();
    harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-01-01")));
    const result = await picked;

    expectOk(result);
    expect(result.value).toBe("Weekly/2026-W1");
  });

  it("reports a cancelled journal choice as cancelled", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dailyIn("Daily"), other: fixedJournal("other", { type: "day" }) } },
    });

    const picked = harness.resolve(JournalNoteLinkPicker).pick();
    await tick();
    harness.suggests.lastOpen().cancel();
    const result = await picked;

    expectErr(result);
    expect(result.error).toBeInstanceOf(JournalNoteLinkCancelledError);
  });

  it("reports a cancelled date choice as cancelled", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dailyIn("Daily") } },
    });

    const picked = harness.resolve(JournalNoteLinkPicker).pick();
    await tick();
    harness.modals.lastOpen().cancel();
    const result = await picked;

    expectErr(result);
    expect(result.error).toBeInstanceOf(JournalNoteLinkCancelledError);
  });

  it("refuses a period the journal neither wrote nor writes", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { timeline: { start: anchor("2027-01-01"), end: { kind: "never" } } },
          ),
        },
      },
    });

    const result = await pickDay(harness, "2026-01-01");

    expectErr(result);
    expect(result.error).toBeInstanceOf(OutOfTimelineError);
  });

  it("refuses a note not created yet when the journal names notes after answers", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}} {{mood}}", prompts: [mood] }),
        },
      },
    });

    const result = await pickDay(harness, "2026-01-01");

    expectErr(result);
    expect(result.error).toBeInstanceOf(NamedByAnswersError);
  });

  it("links an existing note even when the journal names notes after answers", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}} {{mood}}", prompts: [mood] }),
        },
      },
    });
    harness.host.putFile("2026-01-01 calm.md");
    harness.resolve(JournalsIndex).register({
      journalName: "daily",
      anchor: anchor("2026-01-01"),
      path: "2026-01-01 calm.md" as VaultPath,
      answers: { mood: "calm" },
    });

    const result = await pickDay(harness, "2026-01-01");

    expectOk(result);
    expect(result.value).toBe("2026-01-01 calm");
  });
});
