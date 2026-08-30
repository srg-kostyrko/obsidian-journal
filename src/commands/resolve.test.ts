import { describe, expect, it } from "vitest";

import { compoundShift, isAvailableType, supportedTypes, supportedTypesFor } from "./resolve";

describe("supportedTypes", () => {
  it("offers all eleven variants for day journals", () => {
    expect(supportedTypes("day")).toEqual([
      "same",
      "next",
      "previous",
      "previous_available",
      "next_available",
      "same_next_week",
      "same_previous_week",
      "same_next_month",
      "same_previous_month",
      "same_next_year",
      "same_previous_year",
    ]);
  });

  it("offers same/next/previous/available for week journals", () => {
    expect(supportedTypes("week")).toEqual(["same", "next", "previous", "previous_available", "next_available"]);
  });

  it("offers same/next/previous/available for custom journals", () => {
    expect(supportedTypes("custom")).toEqual(["same", "next", "previous", "previous_available", "next_available"]);
  });

  it("adds the available and same-year variants for month journals", () => {
    expect(supportedTypes("month")).toEqual([
      "same",
      "next",
      "previous",
      "previous_available",
      "next_available",
      "same_next_year",
      "same_previous_year",
    ]);
  });

  it("adds the available and same-year variants for quarter journals", () => {
    expect(supportedTypes("quarter")).toEqual([
      "same",
      "next",
      "previous",
      "previous_available",
      "next_available",
      "same_next_year",
      "same_previous_year",
    ]);
  });

  it("offers same/next/previous/available for year journals", () => {
    expect(supportedTypes("year")).toEqual(["same", "next", "previous", "previous_available", "next_available"]);
  });

  it("offers available types for every write type", () => {
    for (const write of ["day", "week", "month", "quarter", "year", "custom"] as const) {
      expect(supportedTypes(write)).toContain("previous_available");
      expect(supportedTypes(write)).toContain("next_available");
    }
  });
});

describe("isAvailableType", () => {
  it("is true only for the available types", () => {
    expect(isAvailableType("previous_available")).toBe(true);
    expect(isAvailableType("next_available")).toBe(true);
    expect(isAvailableType("previous")).toBe(false);
    expect(isAvailableType("same")).toBe(false);
  });
});

describe("compoundShift", () => {
  it("maps same_next_week to a one-week forward shift", () => {
    expect(compoundShift("same_next_week")).toEqual({ amount: 1, unit: "w" });
  });

  it("maps same_previous_week to a one-week backward shift", () => {
    expect(compoundShift("same_previous_week")).toEqual({ amount: -1, unit: "w" });
  });

  it("maps same_next_month to a one-month forward shift", () => {
    expect(compoundShift("same_next_month")).toEqual({ amount: 1, unit: "m" });
  });

  it("maps same_previous_month to a one-month backward shift", () => {
    expect(compoundShift("same_previous_month")).toEqual({ amount: -1, unit: "m" });
  });

  it("maps same_next_year to a one-year forward shift", () => {
    expect(compoundShift("same_next_year")).toEqual({ amount: 1, unit: "y" });
  });

  it("maps same_previous_year to a one-year backward shift", () => {
    expect(compoundShift("same_previous_year")).toEqual({ amount: -1, unit: "y" });
  });

  it("returns null for the non-compound next variant", () => {
    expect(compoundShift("next")).toBeNull();
  });
});

describe("supportedTypesFor", () => {
  const dailyNotelet = { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" } as const;
  const dailyJournal = { kind: "journal", journalName: "Work" } as const;

  it("drops the available-note types for a notelet target", () => {
    const types = supportedTypesFor(dailyNotelet, "day");

    expect(types).not.toContain("previous_available");
    expect(types).not.toContain("next_available");
  });

  it("keeps every shifting type for a notelet target", () => {
    const types = supportedTypesFor(dailyNotelet, "day");

    expect(types).toContain("same");
    expect(types).toContain("next");
    expect(types).toContain("previous");
  });

  it("leaves a non-notelet target's types alone", () => {
    expect(supportedTypesFor(dailyJournal, "day")).toEqual(supportedTypes("day"));
  });

  it("still honors the write type for a notelet target", () => {
    expect(supportedTypesFor(dailyNotelet, "week")).toEqual(
      supportedTypes("week").filter((type) => type !== "previous_available" && type !== "next_available"),
    );
  });
});
