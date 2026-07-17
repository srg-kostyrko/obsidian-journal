// Which shelf a view leaf is scoped to, given the leaf's own override and the view's default.
//
// The override is three-state, and the difference matters: `undefined` is "this leaf has no
// opinion, use the view's default", while `null` is "this leaf was explicitly set to All
// journals". Collapsing them with `??` made picking All journals on a view that has a default
// silently snap back to that default.
//
// The override is also persisted in the workspace layout, so it outlives the shelf it names —
// a rename or delete while the leaf was closed leaves it pointing at nothing. An unresolvable
// shelf scopes the calendar to no journals at all, so it falls through to the view's default
// (which ViewsService keeps valid) rather than showing an empty grid.
export function resolveLeafShelf(
  override: string | null | undefined,
  defaultShelf: string | null,
  shelfExists: (name: string) => boolean,
): string | null {
  if (override === undefined) return defaultShelf;
  if (override === null) return null;
  return shelfExists(override) ? override : defaultShelf;
}
