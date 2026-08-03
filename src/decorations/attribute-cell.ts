import { declaredProperties, type ExclusiveProperty, type Placement } from "./resolve-cell";

import type { Contribution } from "./engine";

export interface PropertyAttribution {
  readonly property: ExclusiveProperty;
  readonly winner: Contribution;
  // Earlier declarations of the same property, in cascade order.
  readonly overridden: readonly Contribution[];
}

export interface CellAttribution {
  readonly properties: readonly PropertyAttribution[];
  readonly marks: Readonly<Record<Placement, readonly Contribution[]>>;
}

function emptyMarks(): Record<Placement, Contribution[]> {
  return {
    left_top: [],
    left_middle: [],
    left_bottom: [],
    center_top: [],
    center_middle: [],
    center_bottom: [],
    right_top: [],
    right_middle: [],
    right_bottom: [],
  };
}

export function attributeCell(contributions: readonly Contribution[]): CellAttribution {
  const declarers = new Map<ExclusiveProperty, Contribution[]>();
  const marks = emptyMarks();

  for (const contribution of contributions) {
    const { style } = contribution;
    if (style.type === "shape" || style.type === "icon") {
      marks[`${style.placement_x}_${style.placement_y}`].push(contribution);
      continue;
    }
    for (const property of declaredProperties(style)) {
      const bucket = declarers.get(property);
      if (bucket) bucket.push(contribution);
      else declarers.set(property, [contribution]);
    }
  }

  const properties: PropertyAttribution[] = [];
  for (const [property, bucket] of declarers) {
    const winner = bucket.at(-1);
    if (!winner) continue;
    properties.push({ property, winner, overridden: bucket.slice(0, -1) });
  }

  return { properties, marks };
}
