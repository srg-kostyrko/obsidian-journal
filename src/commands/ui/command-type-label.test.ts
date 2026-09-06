import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { commandContextLabel, commandTypeLabel } from "./command-type-label";

import type { CommandTarget } from "../config";

const journal: CommandTarget = { kind: "journal", journalName: "Work" };
const notelet: CommandTarget = { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" };

describe("commandTypeLabel", () => {
  it("labels a same-type daily command as today", () => {
    expect(commandTypeLabel(journal, "day", "same", "today")).toBe(m.command_label_today());
  });

  it("labels a next-type daily command in today context as tomorrow", () => {
    expect(commandTypeLabel(journal, "day", "next", "today")).toBe(m.command_label_tomorrow());
  });

  it("labels a previous-type daily command in today context as yesterday", () => {
    expect(commandTypeLabel(journal, "day", "previous", "today")).toBe(m.command_label_yesterday());
  });

  it("labels a next-type daily command in open-note context with the generic form", () => {
    expect(commandTypeLabel(journal, "day", "next", "open_note")).toBe(
      m.command_type_label({ type: "next", writeType: "day" }),
    );
  });

  it("labels a non-daily same command with its write type", () => {
    expect(commandTypeLabel(journal, "week", "same", "today")).toBe(
      m.command_type_label({ type: "same", writeType: "week" }),
    );
  });

  it("labels a compound command with its write type", () => {
    expect(commandTypeLabel(journal, "month", "same_next_year", "today")).toBe(
      m.command_type_label({ type: "same_next_year", writeType: "month" }),
    );
  });

  it("labels a same-type daily notelet command as creating for today", () => {
    expect(commandTypeLabel(notelet, "day", "same", "today")).toBe(m.command_notelet_label_today());
  });

  it("labels a next-type daily notelet command in today context as creating for tomorrow", () => {
    expect(commandTypeLabel(notelet, "day", "next", "today")).toBe(m.command_notelet_label_tomorrow());
  });

  it("labels a previous-type daily notelet command in today context as creating for yesterday", () => {
    expect(commandTypeLabel(notelet, "day", "previous", "today")).toBe(m.command_notelet_label_yesterday());
  });

  it("labels a next-type daily notelet command in open-note context with the generic create form", () => {
    expect(commandTypeLabel(notelet, "day", "next", "open_note")).toBe(
      m.command_notelet_type_label({ type: "next", writeType: "day" }),
    );
  });

  it("labels a non-daily notelet command with its journal's write type", () => {
    expect(commandTypeLabel(notelet, "week", "same", "today")).toBe(
      m.command_notelet_type_label({ type: "same", writeType: "week" }),
    );
  });

  it("labels a compound notelet command with its journal's write type", () => {
    expect(commandTypeLabel(notelet, "month", "same_next_year", "today")).toBe(
      m.command_notelet_type_label({ type: "same_next_year", writeType: "month" }),
    );
  });
});

describe("commandContextLabel", () => {
  it("has no clarifier for the today context", () => {
    expect(commandContextLabel("today")).toBeNull();
  });

  it("clarifies that the open-note context can fall back to today", () => {
    expect(commandContextLabel("open_note")).toBe(m.command_context_open_note_clarifier());
  });

  it("clarifies that the only-open-note context uses the open note's date", () => {
    expect(commandContextLabel("only_open_note")).toBe(m.command_context_only_open_note_clarifier());
  });
});
