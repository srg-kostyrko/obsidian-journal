import { createCellDecorationScope } from "@/decorations/ui/cell-decoration-map-key";

// The whole-block decoration draws only on the current journal's own decorations.
export const navBlockDecorationScope = createCellDecorationScope("nav-block");

// Per-segment decoration follows each segment's link target, so a block can hold both a
// fixed-period target and a custom journal's interval. Those cannot share one map: an
// interval is a "day"-kind period at its start anchor and collides with the genuine day
// cell, so each gets its own provide/inject scope.
export const navSegmentFixedScope = createCellDecorationScope("nav-segment-fixed");
export const navSegmentIntervalScope = createCellDecorationScope("nav-segment-interval");
