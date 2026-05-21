import { describe, expect, it } from "vitest";

import { compoundShift, supportedTypes } from "./resolve";

describe("supportedTypes", () => {
  it("offers all nine variants for day journals", () => {
    expect(supportedTypes("day")).toEqual([
      "same",
      "next",
      "previous",
      "same_next_week",
      "same_previous_week",
      "same_next_month",
      "same_previous_month",
      "same_next_year",
      "same_previous_year",
    ]);
  });

  it("offers only same/next/previous for week journals", () => {
    expect(supportedTypes("week")).toEqual(["same", "next", "previous"]);
  });

  it("offers only same/next/previous for custom journals", () => {
    expect(supportedTypes("custom")).toEqual(["same", "next", "previous"]);
  });

  it("adds the same-year variants for month journals", () => {
    expect(supportedTypes("month")).toEqual(["same", "next", "previous", "same_next_year", "same_previous_year"]);
  });

  it("adds the same-year variants for quarter journals", () => {
    expect(supportedTypes("quarter")).toEqual(["same", "next", "previous", "same_next_year", "same_previous_year"]);
  });

  it("offers only same/next/previous for year journals", () => {
    expect(supportedTypes("year")).toEqual(["same", "next", "previous"]);
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
