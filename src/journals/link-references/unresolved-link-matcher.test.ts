import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Option } from "@/infrastructure/result";
import { testContainer } from "@/testing";

import { CycleService } from "../cycle";
import { journalsCoreModule } from "../module";
import { NotePathService } from "../notes/note-path";
import { customJournal, fixedJournal } from "../testing";

import { UnresolvedLinkMatcher } from "./unresolved-link-matcher";

import type { JournalConfig } from "../config";

const daily = fixedJournal("Daily", { type: "day" }, { folder: "Journal/Daily", nameTemplate: "{{date:YYYY-MM-DD}}" });

async function matcherFor(journals: Record<string, JournalConfig>): Promise<UnresolvedLinkMatcher> {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals } });
  return new UnresolvedLinkMatcher(
    harness.resolve(NotePathService),
    harness.resolve(CycleService),
    Object.keys(journals),
  );
}

describe("UnresolvedLinkMatcher", () => {
  it("matches a bare name the journal would create", async () => {
    const matcher = await matcherFor({ Daily: daily });

    expect(matcher.match("2026-10-05")).toEqual(Option.some({ journalName: "Daily", anchor: anchor("2026-10-05") }));
  });

  it("matches the full would-be path", async () => {
    const matcher = await matcherFor({ Daily: daily });

    expect(matcher.match("Journal/Daily/2026-10-05")).toEqual(
      Option.some({ journalName: "Daily", anchor: anchor("2026-10-05") }),
    );
  });

  it("does not match a path in another folder", async () => {
    const matcher = await matcherFor({ Daily: daily });

    expect(matcher.match("Other/2026-10-05").isNone()).toBe(true);
  });

  it("does not find a date inside longer text", async () => {
    const matcher = await matcherFor({ Daily: daily });

    expect(matcher.match("Meeting 2026-10-05").isNone()).toBe(true);
  });

  it("weekly journal matches only its own name", async () => {
    const matcher = await matcherFor({
      Weekly: fixedJournal("Weekly", { type: "week" }, { folder: "Weekly", nameTemplate: "{{date:GGGG-[W]WW}}" }),
    });

    expect(matcher.match("2026-W41")).toEqual(Option.some({ journalName: "Weekly", anchor: anchor("2026-10-05") }));
    expect(matcher.match("2026-10-07").isNone()).toBe(true);
  });

  it("bare name shared by two journals matches none", async () => {
    const matcher = await matcherFor({
      Daily: daily,
      Work: fixedJournal("Work", { type: "day" }, { folder: "Work", nameTemplate: "{{date:YYYY-MM-DD}}" }),
    });

    expect(matcher.match("2026-10-05").isNone()).toBe(true);
    expect(matcher.match("Work/2026-10-05")).toEqual(
      Option.some({ journalName: "Work", anchor: anchor("2026-10-05") }),
    );
  });

  it("name using a question answer matches none", async () => {
    const matcher = await matcherFor({
      Topics: fixedJournal(
        "Topics",
        { type: "day" },
        {
          folder: "Topics",
          nameTemplate: "{{date:YYYY-MM-DD}} {{topic}}",
          prompts: [{ variable: "topic", question: "?", type: "text", frontmatterKey: "topic", required: false }],
        },
      ),
    });

    expect(matcher.match("2026-10-05 Dentist").isNone()).toBe(true);
  });

  it("name using a chosen answer matches none", async () => {
    const matcher = await matcherFor({
      Topics: fixedJournal(
        "Topics",
        { type: "day" },
        {
          folder: "Topics",
          nameTemplate: "{{date:YYYY-MM-DD}} {{topic}}",
          prompts: [
            {
              variable: "topic",
              question: "?",
              type: "select",
              frontmatterKey: "topic",
              required: false,
              options: [{ label: "Dentist", value: "Dentist" }],
            },
          ],
        },
      ),
    });

    expect(matcher.match("2026-10-05 Dentist").isNone()).toBe(true);
  });

  it("custom-interval journal matches only interval starts", async () => {
    const matcher = await matcherFor({
      Sprint: customJournal("Sprint", "day", 3, "2026-10-01", {
        folder: "Sprint",
        nameTemplate: "{{date:YYYY-MM-DD}}",
      }),
    });

    expect(matcher.match("2026-10-01")).toEqual(Option.some({ journalName: "Sprint", anchor: anchor("2026-10-01") }));
    expect(matcher.match("2026-10-02").isNone()).toBe(true);
  });
});
