import { describe, expect, it } from "vitest";

import { JournalsEventsToken, JournalsRepository, type JournalConfig, type NavBlockSegment } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNavSegment, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { codeBlocksCoreModule } from "../module";

function blockLinkingTo(journalName: string, overrides: Partial<NavBlockSegment> = {}): JournalConfig["navBlock"] {
  const base = fixedJournal("daily", { type: "day" }).navBlock;
  return { ...base, lines: [[buildNavSegment({ link: "journal", journal: journalName, ...overrides })]] };
}

function intervalBlockLinkingTo(
  journalName: string,
  overrides: Partial<NavBlockSegment> = {},
): JournalConfig["intervalBlock"] {
  const base = fixedJournal("sprint", { type: "day" }).intervalBlock;
  return { ...base, lines: [[buildNavSegment({ link: "journal", journal: journalName, ...overrides })]] };
}

async function setup(navBlocks: Record<string, JournalConfig["navBlock"]>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, codeBlocksCoreModule],
    data: {
      journals: Object.fromEntries(
        Object.entries(navBlocks).map(([name, navBlock]) => [name, fixedJournal(name, { type: "day" }, { navBlock })]),
      ),
    },
  });
  return { repo: harness.resolve(JournalsRepository), events: harness.resolve(JournalsEventsToken) };
}

async function setupInterval(intervalBlocks: Record<string, JournalConfig["intervalBlock"]>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, codeBlocksCoreModule],
    data: {
      journals: Object.fromEntries(
        Object.entries(intervalBlocks).map(([name, intervalBlock]) => [
          name,
          fixedJournal(name, { type: "day" }, { intervalBlock }),
        ]),
      ),
    },
  });
  return { repo: harness.resolve(JournalsRepository), events: harness.resolve(JournalsEventsToken) };
}

const segmentOf = (repo: JournalsRepository, name: string): NavBlockSegment =>
  repo.get(name).getOrUndefined()!.navBlock.lines.at(0)!.at(0)!;

const intervalSegmentOf = (repo: JournalsRepository, name: string): NavBlockSegment =>
  repo.get(name).getOrUndefined()!.intervalBlock.lines.at(0)!.at(0)!;

describe("NavReferenceIntegrity", () => {
  it("rewrites a segment's journal reference when that journal is renamed", async () => {
    const { repo, events } = await setup({ daily: blockLinkingTo("weekly") });
    events.emit("renamed", "weekly", "weekly-notes");
    expect(segmentOf(repo, "daily").journal).toBe("weekly-notes");
  });

  it("rewrites references in intervalBlock as well as navBlock", async () => {
    const { repo, events } = await setupInterval({ sprint: intervalBlockLinkingTo("weekly") });
    events.emit("renamed", "weekly", "weekly-notes");
    expect(intervalSegmentOf(repo, "sprint").journal).toBe("weekly-notes");
  });

  it("clears the link when the referenced journal is deleted", async () => {
    const { repo, events } = await setup({ daily: blockLinkingTo("weekly") });
    events.emit("deleted", "weekly");
    expect(segmentOf(repo, "daily")).toMatchObject({ link: "none", journal: "" });
  });

  it("keeps the segment's text when its link is cleared", async () => {
    const { repo, events } = await setup({ daily: blockLinkingTo("weekly", { template: "{{date:[W]w}}" }) });
    events.emit("deleted", "weekly");
    expect(segmentOf(repo, "daily").template).toBe("{{date:[W]w}}");
  });

  it("leaves segments alone when a journal is cloned", async () => {
    const { repo, events } = await setup({ daily: blockLinkingTo("weekly") });
    events.emit("cloned", "weekly", "weekly-copy");
    expect(segmentOf(repo, "daily").journal).toBe("weekly");
  });

  it("leaves segments that reference a different journal untouched", async () => {
    const { repo, events } = await setup({ daily: blockLinkingTo("monthly") });
    events.emit("renamed", "weekly", "weekly-notes");
    expect(segmentOf(repo, "daily").journal).toBe("monthly");
  });
});
