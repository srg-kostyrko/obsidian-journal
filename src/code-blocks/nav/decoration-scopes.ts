import { createCellDecorationScope } from "@/decorations/ui/cell-decoration-map-key";

// The two nav decoration modes draw from different scopes: a whole-block decoration draws only
// on the current journal's own decorations, while a per-row decoration draws on every journal of
// the same write type in scope (the owning shelf, or all journals when the journal has none).
// The two grids share the same cells but need independent style maps, so each gets its own
// provide/inject scope.
export const navBlockDecorationScope = createCellDecorationScope("nav-block");
export const navRowDecorationScope = createCellDecorationScope("nav-row");
