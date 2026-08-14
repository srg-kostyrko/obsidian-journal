import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { commandContextLabel, commandTypeLabel } from "./command-type-label";

describe("commandTypeLabel", () => {
  it("labels a same-type daily command as today", () => {
    expect(commandTypeLabel("day", "same", "today")).toBe(m.command_label_today());
  });

  it("labels a next-type daily command in today context as tomorrow", () => {
    expect(commandTypeLabel("day", "next", "today")).toBe(m.command_label_tomorrow());
  });

  it("labels a previous-type daily command in today context as yesterday", () => {
    expect(commandTypeLabel("day", "previous", "today")).toBe(m.command_label_yesterday());
  });

  it("labels a next-type daily command in open-note context with the generic form", () => {
    expect(commandTypeLabel("day", "next", "open_note")).toBe(m.command_type_label({ type: "next", writeType: "day" }));
  });

  it("labels a non-daily same command with its write type", () => {
    expect(commandTypeLabel("week", "same", "today")).toBe(m.command_type_label({ type: "same", writeType: "week" }));
  });

  it("labels a compound command with its write type", () => {
    expect(commandTypeLabel("month", "same_next_year", "today")).toBe(
      m.command_type_label({ type: "same_next_year", writeType: "month" }),
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
