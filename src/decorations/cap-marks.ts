import { PLACEMENTS, type CellMark, type Placement } from "./resolve-cell";

export interface CappedSlot {
  readonly visible: readonly CellMark[];
  readonly hidden: readonly CellMark[];
}

export const UNLIMITED_MARKS = 0;

// A limit of 1 leaves no room for a mark once the badge takes its place, so it is read as 2.
// The settings dropdown cannot emit it; a hand-edited data.json can.
const MIN_LIMIT = 2;

// Truncation lives here rather than in resolveCell because useCellPadding feeds resolveCell
// every binding's styles to size the whole grid, and that reservation is a per-axis maximum of
// mark size — capping inside it would drop the largest mark out of the reservation and
// under-pad every cell in the surface.
export function capMarks(
  marks: Readonly<Record<Placement, readonly CellMark[]>>,
  limit: number,
): Readonly<Record<Placement, CappedSlot>> {
  const out = {} as Record<Placement, CappedSlot>;
  for (const placement of PLACEMENTS) out[placement] = capSlot(marks[placement], limit);
  return out;
}

// The last marks survive: gatherBindings orders vault-wide, then shelf, then journal, so the
// tail is the most specific owner — the same precedence every exclusive property resolves by.
function capSlot(slot: readonly CellMark[], limit: number): CappedSlot {
  if (limit === UNLIMITED_MARKS || slot.length <= limit) return { visible: slot, hidden: [] };
  const effective = Math.max(limit, MIN_LIMIT);
  if (slot.length <= effective) return { visible: slot, hidden: [] };
  const cut = slot.length - (effective - 1);
  return { visible: slot.slice(cut), hidden: slot.slice(0, cut) };
}
