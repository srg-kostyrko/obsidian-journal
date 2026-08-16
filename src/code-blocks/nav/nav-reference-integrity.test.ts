import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import {
  journalDefaultsFor,
  JournalsRepository,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockSegment,
} from "@/journals";

import { NavReferenceIntegrity } from "./nav-reference-integrity";

const emptyTestSegment: NavBlockSegment = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  linkDate: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

function blockLinkingTo(journalName: string, overrides: Partial<NavBlockSegment> = {}): JournalConfig["navBlock"] {
  const base = journalDefaultsFor({ type: "day" }, "daily").navBlock;
  return { ...base, lines: [[{ ...emptyTestSegment, link: "journal", journal: journalName, ...overrides }]] };
}

function intervalBlockLinkingTo(
  journalName: string,
  overrides: Partial<NavBlockSegment> = {},
): JournalConfig["intervalBlock"] {
  const base = journalDefaultsFor({ type: "day" }, "sprint").intervalBlock;
  return { ...base, lines: [[{ ...emptyTestSegment, link: "journal", journal: journalName, ...overrides }]] };
}

function setup(navBlocks: Record<string, JournalConfig["navBlock"]>) {
  const storage = reactive<Record<string, JournalConfig>>({});
  for (const [name, navBlock] of Object.entries(navBlocks)) {
    storage[name] = { ...journalDefaultsFor({ type: "day" }, name), navBlock };
  }
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  new NavReferenceIntegrity(repo, events);
  return { repo, events };
}

function setupInterval(intervalBlocks: Record<string, JournalConfig["intervalBlock"]>) {
  const storage = reactive<Record<string, JournalConfig>>({});
  for (const [name, intervalBlock] of Object.entries(intervalBlocks)) {
    storage[name] = { ...journalDefaultsFor({ type: "day" }, name), intervalBlock };
  }
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  new NavReferenceIntegrity(repo, events);
  return { repo, events };
}

const segmentOf = (repo: JournalsRepository, name: string): NavBlockSegment =>
  repo.get(name).getOrUndefined()!.navBlock.lines.at(0)!.at(0)!;

const intervalSegmentOf = (repo: JournalsRepository, name: string): NavBlockSegment =>
  repo.get(name).getOrUndefined()!.intervalBlock.lines.at(0)!.at(0)!;

describe("NavReferenceIntegrity", () => {
  it("rewrites a segment's journal reference when that journal is renamed", () => {
    const { repo, events } = setup({ daily: blockLinkingTo("weekly") });
    events.emit("renamed", "weekly", "weekly-notes");
    expect(segmentOf(repo, "daily").journal).toBe("weekly-notes");
  });

  it("rewrites references in intervalBlock as well as navBlock", () => {
    const { repo, events } = setupInterval({ sprint: intervalBlockLinkingTo("weekly") });
    events.emit("renamed", "weekly", "weekly-notes");
    expect(intervalSegmentOf(repo, "sprint").journal).toBe("weekly-notes");
  });

  it("clears the link when the referenced journal is deleted", () => {
    const { repo, events } = setup({ daily: blockLinkingTo("weekly") });
    events.emit("deleted", "weekly");
    expect(segmentOf(repo, "daily")).toMatchObject({ link: "none", journal: "" });
  });

  it("keeps the segment's text when its link is cleared", () => {
    const { repo, events } = setup({ daily: blockLinkingTo("weekly", { template: "{{date:[W]w}}" }) });
    events.emit("deleted", "weekly");
    expect(segmentOf(repo, "daily").template).toBe("{{date:[W]w}}");
  });

  it("leaves segments alone when a journal is cloned", () => {
    const { repo, events } = setup({ daily: blockLinkingTo("weekly") });
    events.emit("cloned", "weekly", "weekly-copy");
    expect(segmentOf(repo, "daily").journal).toBe("weekly");
  });

  it("leaves segments that reference a different journal untouched", () => {
    const { repo, events } = setup({ daily: blockLinkingTo("monthly") });
    events.emit("renamed", "weekly", "weekly-notes");
    expect(segmentOf(repo, "daily").journal).toBe("monthly");
  });
});
