# Style editor canvas — handoff for a fresh session

This is **piece 3 of 3** of the decorations UX rework, and the only one not started. It is also
the piece the original request was actually about.

Start by reading this file, then `docs/superpowers/specs/2026-08-03-decoration-composition-semantics-design.md`
and `docs/superpowers/specs/2026-08-03-decoration-inspector-design.md`. Do not start from the
code — the two shipped pieces changed constraints that the style editor now has to respect.

## The original ask, unchanged

> decoration styles editor UX is quite hard to work with. I'd like to brainstorm on how to
> improve it (in general and every separate style editor)

The editor in question is `EditDecorationModal.vue` and the six `Style*.vue` leaves it composes.
Nothing about them has changed.

## Where the other two pieces landed

| Piece                                                                 | Spec                                                          | State           |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | --------------- |
| 1 — Composition semantics                                             | `specs/2026-08-03-decoration-composition-semantics-design.md` | shipped         |
| 2 — Decorations workspace (inspector modal, cell reach, match badges) | `specs/2026-08-03-decoration-inspector-design.md`             | shipped         |
| 3 — Style editor canvas                                               | none yet                                                      | **not started** |

Piece 2 grew into three plans (`plans/2026-08-03-decoration-inspector-foundation.md`,
`-cell-reach.md`, `plans/2026-08-03-decoration-match-badges.md`). Piece 3 has no spec and no plan.

## What was already decided for piece 3

These came out of a mockup-driven brainstorm and were chosen by the user. Treat them as settled
input, not as open questions to re-litigate — but they are pre-spec, so they have not been
stress-tested against the code.

**Layer-first canvas**, chosen over two alternatives (region-first with a disambiguation menu,
and canvas-as-navigator over a form list). A layer strip — Fill · Text · Border · Marks ·
Corners — gates which regions of a big cell preview are clickable. The canvas **always renders
the whole decoration**; switching layers changes only which regions accept a click. That is what
makes the corner/mark/border overlap problem disappear: only one layer's regions are ever live,
so there is no z-priority rule to learn.

**Marks are born visible.** Today `defaultStyle("shape")`, `("corner")`, `("background")` and
`("icon")` produce something invisible, so adding a style appears to do nothing. A new mark must
get a real default colour.

**Border's uniform/different dropdown becomes a `Linked / Per side` toggle**, and clicking an
edge in per-side mode edits that edge — replacing four heading rows and a 16-row flat stack.

**Layer chips carry badges** showing which layers hold something, so the layered model does not
hide what a decoration contains.

## The one question never answered

**Can two marks share a slot?**

- The renderer already supports it: `placedFrom` (now in `resolve-cell.ts`) buckets marks into
  nine slots and each bucket is an array; `.place` is a flex row with a 2px gap.
- The engine already produces it: styles from every matching decoration are merged onto one cell.
- Only the editor forbids it — `EditDecorationModal.vue:54-58` filters out any style type
  already used, so one decoration gets one shape and one icon, total.

One mark per slot gives a clean 1:1 canvas-to-data map (click empty → add, click filled →
select) and caps at nine. A stack per slot matches the renderer and keeps a habit-tracker row
(three dots at bottom-centre) inside one decoration, at the cost of the canvas no longer being a
literal map.

## Constraints the two shipped pieces impose

These are the reason to read the specs before designing. They did not exist when the layer-first
canvas was chosen.

**1. Transparent defaults are no longer inert — they suppress.** Under the last-wins cascade,
`defaultStyle("background")` (transparent) and `defaultStyle("corner")` (transparent) actively
cancel whatever a broader scope set. A freshly added background style silently kills a
vault-wide one. Both are still transparent today (`defaults.ts:13,31,49`). This was cosmetic
before piece 1; it is a correctness problem now, and fixing it is piece 3's job. The composition
spec records it in its "Ten exclusive properties" section, and the inspector spec's corner
paragraph adds the second style type.

**2. Corners are exclusive per placement.** Two corners at one placement no longer stack — the
later wins. A canvas that offers four corner regions is now a 1:1 map of the data.

**3. Border sides abstain when `show: false`.** A side with `show: false` does not compete and
does not clear a lower contributor. The `Linked / Per side` toggle has to preserve that: hiding a
side must mean "I contribute nothing here", not "I clear this".

**4. `derive-styles.ts` is gone.** Everything resolves through `resolveCell` in
`src/decorations/resolve-cell.ts`, which also exports `declaredProperties(style)` — the single
statement of which exclusive properties each style type competes for. A canvas that maps regions
to properties should be defined against that function, not re-derive the mapping.

## Code map

**The editor being replaced**

- `src/decorations/settings/ui/EditDecorationModal.vue` — the shell: mode dropdown, conditions,
  a 25%-wide preview, the style list. `addStyleOptions` at `:54` is the one-per-type cap.
- `src/decorations/settings/ui/StyleItem.vue` — dispatches to the six leaves.
- `StyleBackground.vue`, `StyleColor.vue`, `StyleShape.vue`, `StyleCorner.vue`, `StyleIcon.vue`,
  `StyleBorder.vue`, `StyleBorderSide.vue`.
- `src/ui/UiColorSettingsPicker.vue` — the three-hop colour control every style uses.

**What it must stay compatible with**

- `src/decorations/config.ts` — the valibot schemas. Changing the stored shape means a v2→v3
  import concern; the composition spec's "no migration" claim does not extend to piece 3.
- `src/decorations/defaults.ts` — where the invisible defaults live.
- `src/decorations/resolve-cell.ts` — `resolveCell`, `declaredProperties`, `Placement`,
  `ExclusiveProperty`, `formatPadding`, `mergePadding`.
- `src/decorations/ui/DecorationPreview.vue` — renders a resolved cell; the canvas is a
  richer sibling of this.

**Built in piece 2, worth knowing about**

- `src/decorations/ui/DecorationBreakdownModal.vue` — the inspector. Already renders a live cell
  beside per-property attribution; some of its layout thinking transfers.
- `src/decorations/match-service.ts`, `match-window.ts` — the badges.

## Facts verified during the shipped work

Recorded so a fresh session does not re-derive or, worse, paraphrase them wrongly.

- `defaultStyle("border")` ships `left.show: true` with the other three `false`, while the editor
  in uniform mode edits `top`. The editor therefore shows "Show: off" on a freshly added border
  whose data has `left` on. A `Linked / Per side` toggle needs to resolve this, not inherit it.
- `DecorationCorner.vue` hardcodes `--size: 0.6em`; corners have no size field.
- The condition vocabulary differs per owner and per journal write type
  (`settings/ui/condition-types.ts`), so decorations are not portable between scopes. This
  constrains the conditions half of the modal if piece 3 touches it.
- `UiIconSuggest` overlays can swallow WDIO clicks in e2e; click programmatically via
  `browser.execute` when testing a modal that has one.

## Mockups

`.superpowers/brainstorm/254385-1785754632/content/` — **git-ignored, will not survive a clean.**

- `canvas-model.html` — the three interaction models, with the layer-first one chosen.
- `layer-first-walkthrough.html` — six frames building one decoration end to end.
- `multiple-marks.html` — the unresolved slot-stacking question.
- `composition-truth.html` — piece 1's finding, kept for context.

Copy anything worth keeping out of `.superpowers/` before running `git clean`.

## Process notes from the shipped work

Nine plan defects were caught by review across the two shipped pieces. Every one had the same
cause and it is worth avoiding rather than rediscovering.

**Transcribe the design's requirements; do not paraphrase them.** Three of the inspector modal's
stated requirements — the custom-interval section, the strike-through, per-slot mark grouping —
were silently absent from the plan because the task text restated the design from memory.

**Prose warnings do not constrain implementers; sample code does.** One brief warned about menu
bleed between tests and then supplied sample code that leaked. The code won.

**A budget check must be able to reach the expensive shape.** The badge plan's perf check
specified 20 decorations over 90 days — about 80 ms. The expensive case (a custom journal with an
offset rule) measured 229 ms and the check could not reach it.

**Acknowledging a regression is not handling it.** One brief identified an empty-menu regression,
wrote it down, told the implementer to "keep it in mind", and scoped the test to the other case.

**Verify gates yourself.** Two subagent reports this session claimed gate results that were
false — one claimed lint errors that did not exist, one claimed a guard was transitively tested
when it was not. Subagents also stall when a command backgrounds past its timeout; run slow
gates from the controller.
