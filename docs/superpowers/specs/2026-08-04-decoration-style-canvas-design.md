# Decoration style canvas

## Problem

A decoration is a picture of a calendar cell. It is authored as a flat form about one.

`EditDecorationModal.vue` gives the preview 25% of one column — one 46px cell — and spends
the rest on a stack of labelled rows. Placement, the most spatial property in the feature,
is two dropdowns reading "Center" and "Bottom" about a square the user is looking straight
at. Switching a border to per-side mode replaces one section with four headings and sixteen
rows, which is the single worst screen in the editor.

All six style types add something that renders nothing:

| Added style | Default           | Renders as                       |
| ----------- | ----------------- | -------------------------------- |
| Background  | transparent       | nothing                          |
| Color       | `text-normal`     | nothing — already the text color |
| Border      | transparent, 1px  | nothing — and misreports itself  |
| Shape       | transparent       | nothing                          |
| Corner      | transparent       | nothing                          |
| Icon        | transparent, `""` | nothing, twice over              |

Since [composition semantics](2026-08-03-decoration-composition-semantics-design.md) landed,
two of those are no longer merely cosmetic. `transparent` is a value, not an abstention, so a
freshly added background style cancels a vault-wide background and a freshly added corner
suppresses the corner beneath it. The editor's defaults now produce silent data loss.

The border misreports itself on top of rendering nothing: `defaultStyle("border")` ships
`left.show: true` with the other three `false`, while the editor in uniform mode edits `top`.
A fresh border reads "Show: off" over data that says on.

## Scope

The styles half of `EditDecorationModal` becomes a canvas. Conditions and mode keep their
current controls; only their placement in the modal changes.

Out of scope: the condition vocabulary and its editors, which differ per owner and per journal
write type (`settings/ui/condition-types.ts`) and are being corrected separately — the
[offset condition](2026-08-03-decoration-offset-condition-ux-design.md) spec shipped that way.
Also out of scope: where decorations are authored, and the cross-decoration view, which is the
[inspector](2026-08-03-decoration-inspector-design.md)'s job.

## A decoration is six slots, not a list of styles

`EditDecorationModal.vue:54` filters `addStyleOptions` to types not already used, so a
decoration holds at most one style of each type. v2 enforced the identical rule —
`_old-code/components/modals/EditDecoration.modal.vue:70` is the same filter — and the v2 to
v3 migration passes `decorations` through verbatim (`settings/legacy/v3-to-v4.ts:45`). No
stored decoration can hold two styles of one type without a hand-edited `data.json`.

That cap is the whole design. Stated as a rule rather than left as a filter on a dropdown, a
decoration stops being a list and becomes a record of six optional slots:

```
fill · text · border · shape · icon · corner
```

Every slot is empty or holds exactly one thing. Nothing stacks, anywhere, so a region of the
canvas maps one-to-one onto a slot and there is never an occupant to disambiguate.

The alternative — letting a slot hold several marks, which the renderer already supports —
was rejected. Marks from _different_ decorations already stack in one placement, because the
engine merges every matching decoration's styles onto one cell; a habit-tracker row of three
dots is three decorations, one per habit. Two marks inside one decoration share its
conditions and can therefore only ever appear together, as a fixed composite glyph. That
buys a rare capability at the cost of the canvas's one-to-one honesty.

`styles` stays `JournalDecorationStyle[]` on disk. The editor projects it to a record and
back. This is not a schema change.

## The canvas

A layer strip of six chips over one large cell. The cell **always renders the whole
decoration**. The active layer decides only which regions accept a click.

That is what dissolves the overlap problem: a slot holding both a shape and an icon is never
ambiguous, because only one of them is ever clickable. There is no z-priority rule to learn
and no disambiguation menu to build.

| Layer  | Regions | Maps to                                        |
| ------ | ------- | ---------------------------------------------- |
| Fill   | 1       | the cell body                                  |
| Text   | 1       | the numeral                                    |
| Border | 1 or 4  | the ring when linked, four edges when per side |
| Shape  | 9       | `placement_x` × `placement_y`                  |
| Icon   | 9       | `placement_x` × `placement_y`                  |
| Corner | 4       | `placement`                                    |

Each chip carries a badge showing whether its slot is occupied, so the layered model never
hides what a decoration contains.

One interaction rule holds in five of the six layers:

- Click an **empty** region — create the style with a visible default, place it there, select it.
- Click the **occupied** region — select it.
- Click a **different** region while the slot is occupied — move it there.
- **Remove** lives in the inspector, never on the canvas.

Because a slot holds at most one thing, "move" is unambiguous and there is no add/remove
decision to make on a second click. The `+ Add style` dropdown disappears: you add a style by
clicking where it goes. Both placement dropdowns disappear with it.

**Border per side is the exception, and it is a schema fact rather than an inconsistency.**
A corner style carries one `placement` field, so four regions share one occupant and a click
moves it. A border style carries four side objects, so it occupies up to four regions at
once. In per-side mode a click therefore _adds_ rather than moves: clicking a grey edge turns
that side on, and Remove turns it off again. The Border chip is the only one whose layer can
show several things at the same time.

The inspector below the canvas holds only what a region cannot express — color, size, width,
line style, shape kind, icon name. With nothing selected it names the layer and says how to
fill it.

## Border

A `Linked / Per side` segmented control replaces the uniform/different dropdown, and maps
onto it exactly: linked is stored `uniform`, per side is stored `different`. No conditional
save logic, and nothing to migrate.

**Linked is one border.** One region, one inspector, one click to create. This is what
`uniform` already means — `resolveCell` copies `left` to all four sides — so the mapping is
the honest one. The editor keeps all four sides synchronised while linked, which makes the
switch to per side a no-op on the data.

**Per side is four edges.** A grey dashed edge is `show: false`. Clicking it paints it on;
the inspector's Remove switches it back off. There is no `Show` toggle, because the canvas
is the toggle — which is what makes the abstention rule from the composition spec something
you can see rather than something that has to be explained.

Switching off the last remaining side empties the border slot entirely. A border with all
four sides hidden would be a filled slot that declares nothing at all, which is exactly the
empty slot's meaning — the one state the slot model exists to keep distinct. A transparent
border is not that case: it declares transparent and clears a lower contributor, which is a
value like any other.

Switching per side → linked turns all four sides on and copies the selected side's look to
them. That is lossy — which sides were off is not recoverable — and it is what "link all
sides" means. Switching linked → per side changes nothing visible.

This deletes the four side headings, the sixteen-row stack, the mode dropdown and the four
`Show` toggles. It also retires the fresh-border lie: linked mode has no per-side identity,
so there is no side for the editor to disagree with.

## Defaults

Every slot arrives visible, in a theme variable rather than a hardcoded hex, so a new layer
follows the user's theme.

| Slot   | Today              | Proposed                                            |
| ------ | ------------------ | --------------------------------------------------- |
| Fill   | transparent        | `interactive-accent`                                |
| Text   | `text-normal`      | `text-accent`                                       |
| Border | transparent, mixed | `text-accent`, 1px solid, linked, all four sides on |
| Shape  | transparent        | `text-accent`, circle                               |
| Icon   | transparent, `""`  | `text-accent`, `star`                               |
| Corner | transparent        | `text-accent`                                       |

Every role admits its value: `fill` spans `text` and `background`, `border` spans `border` and
`text`, and Obsidian defaults both `--text-accent` and `--interactive-accent` to
`var(--color-accent)`. Per-field defaults were explicitly out of scope in
[theme color roles](2026-07-30-theme-color-roles-design.md); this claims them.

The transparent-versus-absent ambiguity needs no further fix. It existed because the schema
had one state for both. The slot model has two: an **empty** slot declares nothing and lets a
broader scope through; a **filled** slot declares a value and wins by last-wins. Choosing
`Transparent` deliberately — the only way to cancel a vault-wide rule, and per the composition
spec a deliberate capability — is a filled slot rendering as a checkerboard, not an absence.

## The shell

Two panes in a widened modal: conditions left and scrolling, canvas right at a fixed size.
Below a narrow breakpoint they stack, which is today's layout, so the fallback is not a second
design to maintain.

The canvas wants roughly 380px square to be worth having, which puts the modal near 760px.
Conditions are usually two or three rows and occasionally eight; a two-pane split is the only
arrangement where a long rule list does not shrink the canvas.

## Components

`StyleItem.vue`'s dispatch is replaced by the layer strip. The six `Style*.vue` leaves survive
as inspector bodies and shrink: both placement dropdowns, the border mode dropdown, the four
`Show` toggles and the four side headings all move into the canvas. `StyleBorderSide.vue`
loses its `show` row and its `v-if`. `StyleBorder.vue`'s synchronising `watch` moves to the
linked-mode write path.

A composable owns the array-to-record projection over the vee-validate field array, exposing
per-type get, put, move and remove. It is the only place that knows `styles` is stored as an
array.

`DecorationPreview.vue` renders a resolved cell and is unchanged; the canvas is a richer
sibling that adds the region overlay, not a replacement.

The canvas is **not** defined against `declaredProperties`. That function answers which
exclusive properties a style competes for in the cascade; the canvas asks where a style lives.
The two agree on borders and corners and diverge completely on marks, which declare nothing
yet occupy nine regions. Coupling them would give the canvas a cascade concern it does not
have.

## Deliberately absent

**Repair for duplicate style types.** A hand-edited `data.json` holding two shapes opens with
the last one shown, consistent with last-wins, and saves with the other dropped. No supported
path produces it — v2 could not, v3's editor cannot, and v3 has no users.

**A period-aware preview.** The canvas shows a day number even for a week or month journal.
It previews a style, not a date, and the modal is not told its period kind.

**A corner size field.** `DecorationCorner.vue` hardcodes `--size: 0.6em`. Adding one is a
feature, not part of this rework.

## Testing

Canvas behaviour, with `@testing-library/vue` and `user-event`, one behaviour per test:
clicking an empty region creates a style of that type; clicking a second region moves the
existing one rather than adding; a freshly created style renders visibly; the inspector's
Remove empties the slot; switching off the last border side empties the border slot; only the
active layer's regions respond to a click; a chip badges as occupied when its slot fills.

The array-to-record projection is a pure function and tests as one: a decoration round-trips
through record and back unchanged, and a duplicate type resolves to the last.

Border mode mapping needs its own tests: linked writes `uniform`, per side writes `different`,
and switching per side → linked turns all four sides on.

Defaults are asserted through `resolveCell` rather than by reading `defaultStyle` — that a
freshly added fill resolves to something other than `inherit` is the behaviour, and it is what
would have caught the suppression bug.

One e2e journey, because the modal's real value is that clicking a cell region changes stored
data: add a fill and a bottom-centre shape by clicking, save, and assert the calendar cell
renders both. Click programmatically via `browser.execute` where `UiIconSuggest` is mounted —
its overlay swallows WDIO clicks. Verify against a base-commit worktree, not `git stash`,
since the nav-template integration failure is a known baseline.

## Rollout

No schema change and no migration. `styles` keeps its array shape and its contents keep their
current types; only the values a _new_ style arrives with change.

The defaults fix is user-visible and wants a `Fixed` entry in `CHANGELOG.md [Unreleased]` with
a closing-keyword commit: adding a background or corner to a journal decoration no longer
silently cancels a vault-wide one.

Gates: `npm run test`, `npm run check:types`, `npm run check:lint`, `npm run test:e2e`.
