// cspell: ignore unshifted
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { Option } from "@/infrastructure/result";
import type { JournalConfig, JournalEntry } from "@/journals";
import { buildNavSegment } from "@/journals/testing";

import { resolveSegmentLink } from "./segment-link";

const REF = "2025-08-15" as AnchorString;

function journal(name: string, type: JournalConfig["write"]["type"]): JournalConfig {
  return { name, write: { type } } as JournalConfig;
}

const daily = journal("daily", "day");
const quarterly = journal("quarterly", "quarter");
const shelfMates = [daily, quarterly];
const noEntry = Option.none<JournalEntry>();

describe("resolveSegmentLink", () => {
  it("keeps the reference date when linkDate is empty", () => {
    const { date } = resolveSegmentLink(buildNavSegment({ link: "quarter" }), daily, shelfMates, noEntry, REF);
    expect(date.toAnchor()).toBe("2025-08-15");
  });

  it("shifts the date by the segment's linkDate", () => {
    const { date } = resolveSegmentLink(
      buildNavSegment({ link: "quarter", linkDate: "+1q" }),
      daily,
      shelfMates,
      noEntry,
      REF,
    );
    expect(date.toAnchor()).toBe("2025-11-15");
  });

  it("targets the quarter journals for a quarter link", () => {
    const { target } = resolveSegmentLink(buildNavSegment({ link: "quarter" }), daily, shelfMates, noEntry, REF);
    expect(target).toEqual({ kind: "open", journalNames: ["quarterly"] });
  });

  it("opens the host journal at the shifted date for a shifted self link", () => {
    const { target, date } = resolveSegmentLink(
      buildNavSegment({ link: "self", linkDate: "-1y" }),
      daily,
      shelfMates,
      noEntry,
      REF,
    );
    expect(target).toEqual({ kind: "open", journalNames: ["daily"] });
    expect(date.toAnchor()).toBe("2024-08-15");
  });

  it("keeps the direct path for an unshifted self link on an existing note", () => {
    const entry = Option.some({ path: "Daily/2025-08-15.md", journalName: "daily", anchor: REF } as JournalEntry);
    const { target } = resolveSegmentLink(buildNavSegment({ link: "self" }), daily, shelfMates, entry, REF);
    expect(target).toEqual({ kind: "self", path: "Daily/2025-08-15.md" });
  });

  it("ignores an unparsable linkDate rather than shifting wrongly", () => {
    const { date } = resolveSegmentLink(
      buildNavSegment({ link: "quarter", linkDate: "nonsense" }),
      daily,
      shelfMates,
      noEntry,
      REF,
    );
    expect(date.toAnchor()).toBe("2025-08-15");
  });
});
