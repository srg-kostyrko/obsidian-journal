# Decoration composition semantics

## Problem

When several decorations match the same cell, their styles are flattened into one array
and each style type merges by a different rule. Nothing states those rules; each one is
implied by the array method the deriving function happens to use.

| Style      | Implementation                    | Effective rule |
| ---------- | --------------------------------- | -------------- |
| Background | `styles.find(...)`                | first wins     |
| Text color | `styles.find(...)`                | first wins     |
| Border     | `for` loop, overwrites each side  | last wins      |
| Marks      | `for` loop, pushes into 9 buckets | all accumulate |
| Corners    | `styles.filter(...)`              | all accumulate |
| Padding    | per-side `Math.max`               | not a cascade  |

`useCellDecorations.gatherDecorations` gathers journal, then shelf, then vault-wide, and
its comment states that this order "is what makes the most specific owner win". That
holds for background and text color. It is exactly inverted for border: a vault-wide
decoration's border beats a journal's. In per-side mode the two do not even compete as
wholes — a journal's left edge and a vault-wide decoration's top edge fuse into one
border neither decoration describes.

The incoherence is not only cross-scope. Two decorations in the same journal's list, both
setting a background and a border, resolve the background to the earlier one and the
border to the later one.

v2 merged styles identically — `CalendarDecoration.vue` used the same `find`, overwriting
`for`, and `filter`. The border rule is a v2 bug carried forward, not a v3 regression.
v2 had no shelf or vault-wide decorations (`decorations` appears once in
`settings.types.ts`, on the journal config), so cross-scope precedence has no v2 behavior
to preserve.

Users cannot see any of this. Each settings row previews its own decoration in isolation,
and the three scopes live on three different screens — the journal edit page, the shelf
edit page, and a dashboard block.

## Scope

One composition model, stated normatively and implemented in one place: an ordered
cascade, ten exclusive properties resolved last-wins, and nine additive mark slots.

The six deriving functions in `derive-styles.ts` collapse into a single `resolveCell`.

Out of scope: attribution (which decoration won a given property), any settings UI
change, the style editor, and where decorations are authored. Those are separate pieces
that build on this one.

## The cascade

Decorations matching a cell form one ordered sequence:

```
vault-wide  →  shelf  →  journals
(list order)  (list order)  (per journal, list order)
```

Later entries win. This is the only precedence rule in the system.

The order reverses today's gathering. Combined with last-wins resolution it yields both
"more specific wins" and "more recently added wins" from a single rule, where the current
code needs opposite rules to get opposite halves of that.

Two journals of the same write type can both be in scope on one surface. There is no
natural specificity between sibling journals, and this design does not invent one: they
cascade in `journalNames` order. That order is incidental today, and stating it as list
order — rather than leaving it implied — is what lets a later surface display the
resulting order instead of hiding it.

## Ten exclusive properties

Each is resolved to a single winner: the last contributor that declares it.

| Property                                                         | Declared when                         |
| ---------------------------------------------------------------- | ------------------------------------- |
| `background`                                                     | a `background` style is present       |
| `textColor`                                                      | a `color` style is present            |
| `border.top`, `border.right`, `border.bottom`, `border.left`     | that side has `show: true`            |
| `corner.top-left`, `.top-right`, `.bottom-left`, `.bottom-right` | a `corner` style names that placement |

A border side with `show: false` **abstains**. It does not compete and does not clear an
earlier contributor. Abstention is what keeps per-side composition working: a decoration
painting only a left accent declares `left` and stays silent on the other three sides,
so a second decoration's top accent survives alongside it.

`transparent` is a value, not an abstention. A journal decoration with a transparent
background clears a vault-wide decoration's background. This is the only way a narrower
scope can cancel a broader one, and it is deliberate.

Because `defaultStyle("background")` returns a transparent color, a freshly added
background style silently cancels anything below it. That belongs to the style editor
piece, but it stops being merely cosmetic under this model — the editor's defaults and
this cascade have to be resolved together.

Corners become exclusive per placement. `DecorationCorner.vue` hardcodes `--size: 0.6em`
with no per-style size, so two corners at one placement are identical triangles and the
later one already covers the earlier. Today's code renders both; only stacking corners
whose colors carry alpha produces a visible difference.

## Nine additive mark slots

Shapes and icons never compete. Each of the nine placement slots holds an ordered list in
cascade order, so vault-wide marks render before a journal's within a slot.

## Padding

Derived, not cascaded. Per-side maximum over every contributing style, then a per-grid
maximum across cells so one decorated cell does not inflate its own row. Unchanged.

## Behavior changes

1. Border precedence inverts — journal beats shelf beats vault-wide.
2. Background and text color tie-break inverts — a later decoration in the same list wins.
3. At most one corner renders per placement.
4. Mark order within a slot reverses across scopes.

## resolveCell

The semantic change is four edits: reverse `gatherDecorations`, rewrite the comment that
documents the old rule, switch background and text color to `findLast`, and reduce corners
to the last per placement. Border needs no change — its overwriting loop already is
last-wins, and reversing the gather order is the entire border fix.

The consolidation is separate, and is the durable half. Today the cascade rule is encoded
in each function's choice of array method, which is why the border bug is invisible in
review: `borderStylesFrom` is correct in isolation and wrong only against a rule stated
nowhere near it. Routing all ten exclusive properties through one pass makes the rule
reviewable in one place.

```ts
export type CellMark = JournalDecorationShape | JournalDecorationIcon;

export interface ResolvedCell {
  readonly background: string; // "inherit" when undeclared
  readonly textColor: string;
  readonly border: { top: string; right: string; bottom: string; left: string };
  readonly corners: readonly JournalDecorationCorner[]; // at most one per placement
  readonly marks: Readonly<Record<Placement, readonly CellMark[]>>;
  readonly padding: PaddingExtents;
}

export function resolveCell(styles: readonly JournalDecorationStyle[]): ResolvedCell;
export function formatPadding(extents: PaddingExtents): string;
export function mergePadding(all: Iterable<PaddingExtents>): PaddingExtents;
```

`derive-styles.ts` becomes `resolve-cell.ts`. `CellDecoration.vue` and
`DecorationPreview.vue` each drop from six computeds to one. `PaddingExtents` becomes
exported so the grid-wide maximum needs no second entry point.

`resolveCell` always computes padding extents, where `CellDecoration` currently skips that
work when the grid supplies shared padding. The cost is a loop over a handful of styles
per cell.

`resolveCell` stays a pure function of an ordered style sequence, carrying no provenance.
The engine flattens with `bucket.push(...styles)` and discards which decoration each style
came from, so answering "which decoration set this background" needs a wider bucket type.
That is deferred: `DecorationPreview` feeds `resolveCell` a bare style array with no
decorations behind it, so provenance would have to be optional everywhere and carried by
consumers that never read it. "Which decorations matched this cell" is also a much cheaper
question than "which decoration won each property", and is answerable as a separate query
on the engine without touching `resolveCell`. Keeping `resolveCell` pure over an ordered
sequence means winners stay derivable by re-running it over prefixes.

## Testing

Both existing precedence tests in `use-cell-decorations.test.ts` assert array position
rather than outcome:

```ts
// backgroundFrom() takes the first background in the bucket, so order is the precedence rule.
expect(cells.get(key(period))?.value.at(0)).toEqual(journalStyle);
```

The behavior they name — a journal's background beating a vault-wide decoration's — does
not change under this design, yet both tests fail, because they test the implementation
detail being inverted. They are renamed to the behavior and re-pointed at
`resolveCell(...).background`.

`derive-styles.test.ts` becomes `resolve-cell.test.ts`. Two assertions invert to last-wins,
the corner test inverts in meaning, the rest port over.

New unit coverage, one behavior per test:

- A later background declaration replaces an earlier one.
- A transparent background declaration clears an earlier color.
- A later `show: true` border side replaces an earlier one.
- A later `show: false` border side leaves the earlier side standing.
- A uniform border declares all four sides.
- The last corner at a placement wins.
- Corners at different placements coexist.
- Marks accumulate in cascade order within a slot.

Cascade coverage stays in `use-cell-decorations.test.ts`, one test per boundary: a
journal's background over a shelf's, a shelf's over a vault-wide one, and a journal's
border over a vault-wide one. The border boundary has no equivalent at any layer today.

`e2e/journeys/decorations.ts` covers each style type rendering in isolation and nothing
about interaction, which is why the border bug survived a full suite. One journey is
added: a journal decoration and a vault-wide decoration bordering the same day in
different custom hex colors, asserting the journal's color renders. The colors must differ
so the journey reports the vault-wide color under the old rule and cannot pass with the
bug present. Assert color through `getCSSProperty(...).parsed.hex` with custom hex rather
than theme variables, and assert color rather than width, since editor zoom rescales
authored pixel values.

Fixtures with several marks in one slot may show mark-order churn. That is expected.
Verify e2e against a base-commit worktree rather than `git stash`, since the nav-template
integration failure is a known baseline.

## Rollout

No migration. This is read-side semantics: no schema change, no stored-data change, and
the v2 to v3 import is untouched.

The border fix is user-visible and wants a `Fixed` entry in `CHANGELOG.md [Unreleased]`
with a closing-keyword commit.

Gates: `npm run test`, `npm run check:types`, `npm run check:lint`, and `npm run test:e2e`.
