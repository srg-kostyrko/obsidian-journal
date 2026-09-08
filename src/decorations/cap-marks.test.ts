import { describe, expect, it } from "vitest";

import { capMarks } from "./cap-marks";
import { PLACEMENTS, type CellMark, type Placement } from "./resolve-cell";
import { buildStyle } from "./testing";

function shape(color: string): CellMark {
  return buildStyle("shape", { color: { type: "custom", color } });
}

function slots(overrides: Partial<Record<Placement, readonly CellMark[]>>): Record<Placement, readonly CellMark[]> {
  const out = {} as Record<Placement, readonly CellMark[]>;
  for (const placement of PLACEMENTS) out[placement] = overrides[placement] ?? [];
  return out;
}

function colors(marks: readonly CellMark[]): string[] {
  return marks.map((mark) => (mark.color.type === "custom" ? mark.color.color : mark.color.type));
}

describe("capMarks", () => {
  it("leaves every slot whole when the limit is unlimited", () => {
    const marks = slots({ right_top: [shape("#1"), shape("#2"), shape("#3"), shape("#4")] });

    const capped = capMarks(marks, 0);

    expect(capped.right_top.visible).toHaveLength(4);
    expect(capped.right_top.hidden).toHaveLength(0);
  });

  it("hides nothing when a slot holds exactly the limit", () => {
    const marks = slots({ right_top: [shape("#1"), shape("#2"), shape("#3")] });

    const capped = capMarks(marks, 3);

    expect(capped.right_top.visible).toHaveLength(3);
    expect(capped.right_top.hidden).toHaveLength(0);
  });

  it("leaves room for the badge, so a full slot never exceeds the limit", () => {
    const marks = slots({ right_top: [shape("#1"), shape("#2"), shape("#3"), shape("#4"), shape("#5")] });

    const capped = capMarks(marks, 3);

    expect(capped.right_top.visible).toHaveLength(2);
    expect(capped.right_top.hidden).toHaveLength(3);
  });

  // gatherBindings orders vault-wide -> shelf -> journal, so the tail is the most specific
  // owner. Truncating the tail instead would keep vault-wide marks and hide the journal's own,
  // which no other assertion in this file would catch.
  it("keeps the most specific marks and hides the broadest", () => {
    const marks = slots({ right_top: [shape("#vault"), shape("#shelf"), shape("#journalA"), shape("#journalB")] });

    const capped = capMarks(marks, 3);

    expect(colors(capped.right_top.visible)).toEqual(["#journalA", "#journalB"]);
    expect(colors(capped.right_top.hidden)).toEqual(["#vault", "#shelf"]);
  });

  it("treats a limit of 1 as 2, since 1 would render a badge and no mark at all", () => {
    const marks = slots({ right_top: [shape("#1"), shape("#2"), shape("#3")] });

    const capped = capMarks(marks, 1);

    expect(capped.right_top.visible).toHaveLength(1);
    expect(capped.right_top.hidden).toHaveLength(2);
  });

  it("caps each slot independently", () => {
    const marks = slots({
      right_top: [shape("#1"), shape("#2"), shape("#3"), shape("#4")],
      left_bottom: [shape("#5")],
    });

    const capped = capMarks(marks, 3);

    expect(capped.right_top.hidden).toHaveLength(2);
    expect(capped.left_bottom.hidden).toHaveLength(0);
    expect(capped.left_bottom.visible).toHaveLength(1);
    expect(capped.center_middle.visible).toHaveLength(0);
  });
});
