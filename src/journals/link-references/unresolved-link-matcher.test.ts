import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { TemplateEngine } from "@/templates";
import { testContainer } from "@/testing";

import { CycleService } from "../cycle";
import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { NotePathService } from "../notes/note-path";
import { customJournal, fixedJournal } from "../testing";

import { UnresolvedLinkMatcher } from "./unresolved-link-matcher";

import type { JournalConfig } from "../config";

const daily = fixedJournal("Daily", { type: "day" }, { folder: "Journal/Daily", nameTemplate: "{{date:YYYY-MM-DD}}" });

const sprint = customJournal("Sprint", "day", 3, "2026-10-01", {
  folder: "Sprints",
  nameTemplate: "{{date:YYYY-MM-DD}}",
});
const extendFirst = (index: JournalsIndex): void => {
  index.register({
    journalName: "Sprint",
    anchor: anchor("2026-10-01"),
    path: "Sprints/2026-10-01.md" as VaultPath,
    endDate: anchor("2026-10-04"),
  });
};

async function matcherFor(
  journals: Record<string, JournalConfig>,
  setUp: (index: JournalsIndex) => void = () => undefined,
): Promise<{ matcher: UnresolvedLinkMatcher; index: JournalsIndex }> {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals } });
  const index = harness.resolve(JournalsIndex);
  setUp(index);
  const services = {
    paths: harness.resolve(NotePathService),
    cycle: harness.resolve(CycleService),
    engine: harness.resolve(TemplateEngine),
  };
  return { matcher: new UnresolvedLinkMatcher(services, Object.keys(journals)), index };
}

describe("UnresolvedLinkMatcher", () => {
  it("matches a bare name the journal would create", async () => {
    const { matcher } = await matcherFor({ Daily: daily });

    expect(matcher.match("2026-10-05")).toEqual(Option.some({ journalName: "Daily", anchor: anchor("2026-10-05") }));
  });

  it("matches the full would-be path", async () => {
    const { matcher } = await matcherFor({ Daily: daily });

    expect(matcher.match("Journal/Daily/2026-10-05")).toEqual(
      Option.some({ journalName: "Daily", anchor: anchor("2026-10-05") }),
    );
  });

  it("does not match a path in another folder", async () => {
    const { matcher } = await matcherFor({ Daily: daily });

    expect(matcher.match("Other/2026-10-05").isNone()).toBe(true);
  });

  it("does not find a date inside longer text", async () => {
    const { matcher } = await matcherFor({ Daily: daily });

    expect(matcher.match("Meeting 2026-10-05").isNone()).toBe(true);
  });

  it("weekly journal matches only its own name", async () => {
    const { matcher } = await matcherFor({
      Weekly: fixedJournal("Weekly", { type: "week" }, { folder: "Weekly", nameTemplate: "{{date:GGGG-[W]WW}}" }),
    });

    expect(matcher.match("2026-W41")).toEqual(Option.some({ journalName: "Weekly", anchor: anchor("2026-10-05") }));
    expect(matcher.match("2026-10-07").isNone()).toBe(true);
  });

  it("bare name shared by two journals matches none", async () => {
    const { matcher } = await matcherFor({
      Daily: daily,
      Work: fixedJournal("Work", { type: "day" }, { folder: "Work", nameTemplate: "{{date:YYYY-MM-DD}}" }),
    });

    expect(matcher.match("2026-10-05").isNone()).toBe(true);
    expect(matcher.match("Work/2026-10-05")).toEqual(
      Option.some({ journalName: "Work", anchor: anchor("2026-10-05") }),
    );
  });

  it("name using a question answer matches none", async () => {
    const { matcher } = await matcherFor({
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
    const { matcher } = await matcherFor({
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
    expect(matcher.match("Topics/2026-10-05 Dentist").isNone()).toBe(true);
  });

  it("placeholder name on a select-question journal matches none", async () => {
    const { matcher } = await matcherFor({
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

    expect(matcher.match("2026-10-05 (unanswered)").isNone()).toBe(true);
    expect(matcher.match("Topics/2026-10-05 (unanswered)").isNone()).toBe(true);
  });

  it("custom-interval journal matches only interval starts", async () => {
    const { matcher } = await matcherFor({
      Sprint: customJournal("Sprint", "day", 3, "2026-10-01", {
        folder: "Sprint",
        nameTemplate: "{{date:YYYY-MM-DD}}",
      }),
    });

    expect(matcher.match("2026-10-01")).toEqual(Option.some({ journalName: "Sprint", anchor: anchor("2026-10-01") }));
    expect(matcher.match("2026-10-02").isNone()).toBe(true);
  });

  it("placeholder name on a text-question journal matches none", async () => {
    const { matcher } = await matcherFor({
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

    expect(matcher.match("2026-10-05 (unanswered)").isNone()).toBe(true);
    expect(matcher.match("Topics/2026-10-05 (unanswered)").isNone()).toBe(true);
  });

  it("question only in the folder still matches the bare name, never the path", async () => {
    const { matcher } = await matcherFor({
      Topics: fixedJournal(
        "Topics",
        { type: "day" },
        {
          folder: "Topics/{{topic}}",
          nameTemplate: "{{date:YYYY-MM-DD}}",
          prompts: [{ variable: "topic", question: "?", type: "text", frontmatterKey: "topic", required: false }],
        },
      ),
    });

    expect(matcher.match("2026-10-05")).toEqual(Option.some({ journalName: "Topics", anchor: anchor("2026-10-05") }));
    expect(matcher.match("Topics/Dentist/2026-10-05").isNone()).toBe(true);
    expect(matcher.match("Topics/(unanswered)/2026-10-05").isNone()).toBe(true);
  });

  it("clock time only in the folder still matches the bare name, never the path", async () => {
    const { matcher } = await matcherFor({
      Daily: fixedJournal("Daily", { type: "day" }, { folder: "Log/{{time:HH}}", nameTemplate: "{{date:YYYY-MM-DD}}" }),
    });

    expect(matcher.match("2026-10-05")).toEqual(Option.some({ journalName: "Daily", anchor: anchor("2026-10-05") }));
    expect(matcher.match("Log/09/2026-10-05").isNone()).toBe(true);
  });

  it("clock time in the name matches none", async () => {
    const { matcher } = await matcherFor({
      Daily: fixedJournal("Daily", { type: "day" }, { folder: "Log", nameTemplate: "{{date:YYYY-MM-DD}} {{time:HH}}" }),
    });

    expect(matcher.match("2026-10-05 09").isNone()).toBe(true);
    expect(matcher.match("Log/2026-10-05 09").isNone()).toBe(true);
  });

  it("date split into the folder matches only by full path", async () => {
    const { matcher } = await matcherFor({
      Daily: fixedJournal("Daily", { type: "day" }, { folder: "{{date:YYYY}}", nameTemplate: "{{date:MM-DD}}" }),
    });

    expect(matcher.match("01-15").isNone()).toBe(true);
    expect(matcher.match("2026/01-15")).toEqual(Option.some({ journalName: "Daily", anchor: anchor("2026-01-15") }));
  });

  describe("when a custom interval's stored end moves after construction", () => {
    it("answers for the boundaries the index holds now", async () => {
      const { matcher, index } = await matcherFor({ Sprint: sprint });
      expect(matcher.match("2026-10-05").isNone()).toBe(true);

      extendFirst(index);

      expect(matcher.match("2026-10-05")).toEqual(Option.some({ journalName: "Sprint", anchor: anchor("2026-10-05") }));
    });

    it("re-answers a name another journal held alone as shared once the interval renders it too", async () => {
      const { matcher, index } = await matcherFor({ Daily: daily, Sprint: sprint });
      const before = matcher.match("2026-10-05");
      expect(before).toEqual(Option.some({ journalName: "Daily", anchor: anchor("2026-10-05") }));

      extendFirst(index);

      expect(matcher.rematch("2026-10-05", "Sprint", before).isNone()).toBe(true);
    });

    it("keeps another journal's answer when the interval still does not render the name", async () => {
      const { matcher } = await matcherFor({ Daily: daily, Sprint: sprint });
      const before = matcher.match("2026-10-05");

      expect(matcher.rematch("2026-10-05", "Sprint", before)).toEqual(before);
    });
  });
});
