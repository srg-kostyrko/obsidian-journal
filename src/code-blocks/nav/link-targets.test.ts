import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { journalDefaultsFor, type JournalConfig, type JournalEntry, type NavBlockRow } from "@/journals";

import { resolveLinkTarget } from "./link-targets";

const noteJournal: JournalConfig = journalDefaultsFor({ type: "day" }, "daily");
const noteEntry: Option<JournalEntry> = Option.some({
  journalName: "daily",
  anchor: "2026-05-27" as AnchorString,
  path: "Daily/2026-05-27.md" as VaultPath,
});
const baseRow: NavBlockRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "transparent" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("resolveLinkTarget", () => {
  it("returns kind 'none' for link 'none'", () => {
    expect(resolveLinkTarget({ ...baseRow, link: "none" }, noteJournal, [noteJournal], noteEntry).kind).toBe("none");
  });

  it("returns kind 'self' with the entry path for link 'self' when entry exists", () => {
    const result = resolveLinkTarget({ ...baseRow, link: "self" }, noteJournal, [noteJournal], noteEntry);
    expect(result).toEqual({ kind: "self", path: "Daily/2026-05-27.md" });
  });

  it("collapses link 'self' to 'none' when entry is absent", () => {
    expect(resolveLinkTarget({ ...baseRow, link: "self" }, noteJournal, [noteJournal], Option.none()).kind).toBe(
      "none",
    );
  });

  it("returns kind 'open' with the row's journal for link 'journal' when journal is set", () => {
    const result = resolveLinkTarget(
      { ...baseRow, link: "journal", journal: "weekly" },
      noteJournal,
      [noteJournal],
      noteEntry,
    );
    expect(result).toEqual({ kind: "open", journalNames: ["weekly"] });
  });

  it("collapses link 'journal' with empty name to 'none'", () => {
    expect(
      resolveLinkTarget({ ...baseRow, link: "journal", journal: "" }, noteJournal, [noteJournal], noteEntry).kind,
    ).toBe("none");
  });

  it("returns shelf journals matching the period kind", () => {
    const weekly = journalDefaultsFor({ type: "week" }, "weekly");
    const yearly = journalDefaultsFor({ type: "year" }, "yearly");
    const result = resolveLinkTarget(
      { ...baseRow, link: "week" },
      noteJournal,
      [noteJournal, weekly, yearly],
      noteEntry,
    );
    expect(result).toEqual({ kind: "open", journalNames: ["weekly"] });
  });

  it("collapses to 'none' when no shelf journal matches the period kind", () => {
    expect(resolveLinkTarget({ ...baseRow, link: "year" }, noteJournal, [noteJournal], noteEntry).kind).toBe("none");
  });
});
