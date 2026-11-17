import { cloneFnJSON } from "@vueuse/core";
import { describe, expect, it } from "vitest";

import { remapNoteletTypeIds } from "./notelet-type-cascade";
import { buildCondition, buildDecoration, buildStyle } from "./testing";

const drop = (gone: string) => (id: string) => (id === gone ? undefined : id);

const styles = [buildStyle("background")];
const title = () => buildCondition("title", { condition: "contains", value: "x" });

describe("remapNoteletTypeIds", () => {
  it("removes an and-decoration whose has-notelet list empties", () => {
    const dead = buildDecoration({
      mode: "and",
      conditions: [title(), buildCondition("has-notelet", { typeIds: ["nt_1"] })],
      styles,
    });

    const result = remapNoteletTypeIds([dead], drop("nt_1"));

    expect(result.decorations).toEqual([]);
    expect(result.removed).toEqual([dead]);
    expect(result.changed).toBe(true);
  });

  it("drops only the dead condition from an or-decoration", () => {
    const decoration = buildDecoration({
      mode: "or",
      conditions: [title(), buildCondition("has-notelet", { typeIds: ["nt_1"] })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.decorations).toEqual([{ ...decoration, conditions: [title()] }]);
    expect(result.removed).toEqual([]);
  });

  it("removes an or-decoration left with no conditions", () => {
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.decorations).toEqual([]);
    expect(result.removed).toEqual([decoration]);
  });

  it("rewrites a both-scoped tag condition to note scope", () => {
    const decoration = buildDecoration({
      conditions: [buildCondition("tag", { source: "both", typeIds: ["nt_1"], quantifier: "none" })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.decorations[0]?.conditions).toMatchObject([
      { type: "tag", source: "note", typeIds: [], quantifier: "none" },
    ]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toBe(true);
  });

  it("treats an emptied notelets-scoped property condition as dead", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [buildCondition("property", { source: "notelets", typeIds: ["nt_1"] })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.removed).toEqual([decoration]);
  });

  it("keeps a shortened list", () => {
    const decoration = buildDecoration({
      conditions: [buildCondition("has-notelet", { typeIds: ["nt_1", "nt_2"] })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.decorations[0]?.conditions).toMatchObject([{ type: "has-notelet", typeIds: ["nt_2"] }]);
    expect(result.removed).toEqual([]);
  });

  it("maps ids to their replacements", () => {
    const decoration = buildDecoration({
      conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], (id) => (id === "nt_1" ? "nt_9" : undefined));

    expect(result.decorations[0]?.conditions).toMatchObject([{ typeIds: ["nt_9"] }]);
  });

  it("leaves authored any-type lists alone", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [
        buildCondition("has-notelet", { typeIds: [] }),
        buildCondition("tag", { source: "notelets", typeIds: [] }),
      ],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.decorations).toEqual([decoration]);
    expect(result.changed).toBe(false);
  });

  it("strips dead ids from a note-scoped condition and keeps the condition and decoration", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [
        buildCondition("tag", { source: "note", typeIds: ["nt_1"] }),
        buildCondition("property", { source: "note", typeIds: ["nt_1", "nt_2"] }),
      ],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.removed).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.decorations[0]?.conditions).toMatchObject([
      { type: "tag", source: "note", typeIds: [] },
      { type: "property", source: "note", typeIds: ["nt_2"] },
    ]);
  });

  it("maps a note-scoped condition's ids to their clones", () => {
    const decoration = buildDecoration({
      mode: "and",
      conditions: [buildCondition("tag", { source: "note", typeIds: ["nt_1"] })],
      styles,
    });

    const result = remapNoteletTypeIds([decoration], (id) => (id === "nt_1" ? "nt_9" : undefined));

    expect(result.decorations[0]?.conditions).toMatchObject([{ source: "note", typeIds: ["nt_9"] }]);
  });

  it("leaves a decoration that had no conditions alone", () => {
    const decoration = buildDecoration({ conditions: [], styles });

    const result = remapNoteletTypeIds([decoration], drop("nt_1"));

    expect(result.decorations).toEqual([decoration]);
    expect(result.removed).toEqual([]);
  });

  it("reports changed: false and returns the input when nothing names the id", () => {
    const decorations = [
      buildDecoration({ conditions: [buildCondition("has-notelet", { typeIds: ["nt_2"] })], styles }),
    ];

    const result = remapNoteletTypeIds(decorations, drop("nt_1"));

    expect(result.changed).toBe(false);
    expect(result.decorations).toBe(decorations);
  });

  it("reports removed decorations in original order", () => {
    const first = buildDecoration({ conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })], styles });
    const kept = buildDecoration({ conditions: [title()], styles });
    const last = buildDecoration({ conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })], styles });

    const result = remapNoteletTypeIds([first, kept, last], drop("nt_1"));

    expect(result.removed).toEqual([first, last]);
    expect(result.decorations).toEqual([kept]);
  });

  it("does not mutate its input on a changed run", () => {
    const input = [
      buildDecoration({ mode: "and", conditions: [buildCondition("has-notelet", { typeIds: ["nt_1"] })], styles }),
      buildDecoration({
        conditions: [buildCondition("tag", { source: "both", typeIds: ["nt_1"], quantifier: "none" })],
        styles,
      }),
    ];
    const snapshot = cloneFnJSON(input);

    const result = remapNoteletTypeIds(input, drop("nt_1"));

    expect(result.changed).toBe(true);
    expect(input).toEqual(snapshot);
  });
});
