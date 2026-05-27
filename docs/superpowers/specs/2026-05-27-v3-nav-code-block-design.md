# v3 Navigation Code Block

## Goal

Port v2's `NavigationCodeBlock` to v3 under the existing code-block foundation, and add the per-journal `navBlock` config it depends on. Preserve v2's feature set 1:1 — three key aliases, decorations integration, hover preview, context menu, link routing, template rendering — swapping only the rendering engine and the surrounding plumbing for their v3 equivalents.

## Background

v2 ships three markdown code-block keys (`calendar-nav`, `journal-nav`, `interval-nav`) all backed by `NavigationCodeBlock.vue`. The YAML body of these blocks is ignored: every option lives on the note's owning journal under `journal.navBlock`:

```ts
navBlock: {
  type: "create" | "existing";
  rows: NavBlockRow[];
  decorateWholeBlock: boolean;
}
```

Each row carries a template string, font/style settings, color/background, an `addDecorations` flag, and a `link` kind (`none` / `self` / `journal` / one of the fixed period kinds). The block renders three columns — previous / current / next — and dispatches navigation, context-menu, and hover-preview through the v2 plugin façade.

v3 has the code-block foundation in place but does not yet define `navBlock` on `JournalConfig`. This spec adds the field and ports the runtime block. The in-settings row editor is deferred to a separate spec.

## Scope

In scope:

- `src/journals/config.ts` — add `colorSettingsSchema`, `navBlockRowSchema`, `navBlockSchema`, and the `navBlock` field on `journalConfigSchema`. Extend `journalDefaultsFor(write, name)` to return per-write-type default rows (ports v2's `defaultNavBlocks`).
- `src/code-blocks/nav/` — new sub-folder owning the code-block definition, pure helpers (`link-targets`, `nav-row-context`), and Vue UI (`NavigationCodeBlock.vue`, `NavBlock.vue`, `NavBlockRow.vue`).
- `src/code-blocks/module.ts` — register the navigation definition next to the home one.
- i18n key for the "note not connected to a journal" fallback message.

Out of scope:

- The per-journal `navBlock` editor (preview + row add/edit/remove modal) under journal settings — separate spec.
- v2's `calendarViewBlock` schema — obsolete in v3 (the notes-calendar feature already replaces it cell-by-cell).
- Any extension beyond v2 fidelity (per-block YAML overrides, new variables, new link kinds, etc.).

## Architecture

```
src/
  journals/
    config.ts                     + colorSettingsSchema, navBlockRowSchema,
                                    navBlockSchema, navBlock field, per-type
                                    default rows in journalDefaultsFor
    config.test.ts                + cases for navBlock parse/defaults
  code-blocks/
    module.ts                     + useValue(navigationCodeBlock)
    nav/
      nav-block.ts                defineCodeBlock(navigationCodeBlock)
      link-targets.ts             pure: row → journal-name list
      link-targets.test.ts
      nav-row-context.ts          pure: builds TemplateContext for a row
      nav-row-context.test.ts
      ui/
        NavigationCodeBlock.vue   top-level: prev / current / next columns
        NavBlock.vue              column: row list + optional whole-block decoration
        NavBlockRow.vue           row: text + handlers + optional cell decoration
        NavigationCodeBlock.test.ts
```

Data flow on render:

1. The foundation invokes `NavigationCodeBlock.vue` with `{ path, config: {} }`.
2. The component resolves `JournalsIndex.entryByPath(path)` to find the note's journal/anchor.
3. It computes previous/next ref anchors from the journal's `navBlock.type`:
   - `"create"` → `CycleService.previousAnchor(name, anchor)` / `.nextAnchor(name, anchor)`.
   - `"existing"` → `JournalsIndex.findPrevious(name, anchor)` / `.findNext(name, anchor)`; renders empty side when none.
4. It calls `useCellDecorations(periods, journalNames)` once for the three anchors and the shelf-grouped journal set (all journals on the note's shelf with the same `write.type`).
5. It renders three `<NavBlock>` columns plus arrow `IconButton`s between them.
6. Inside each `NavBlock`, rows render via `NavBlockRow`. `decorateWholeBlock` wraps the row list in `<CellDecoration>`; per-row `addDecorations` wraps the row's text.
7. Row handlers dispatch via `Flows`, `JournalsIndex`, and `WorkspaceService`.

## Schema changes — `src/journals/config.ts`

```ts
const colorSettingsSchema = v.union([
  v.object({ type: v.literal("transparent") }),
  v.object({ type: v.literal("theme"), name: v.string() }),
  v.object({ type: v.literal("custom"), color: v.string() }),
]);

const navBlockRowLinkSchema = v.union([
  v.literal("none"),
  v.literal("self"),
  v.literal("journal"),
  v.picklist(["day", "week", "month", "quarter", "year"]),
]);

const navBlockRowSchema = v.object({
  template: v.string(),
  fontSize: v.number(),
  bold: v.boolean(),
  italic: v.boolean(),
  color: colorSettingsSchema,
  background: colorSettingsSchema,
  link: navBlockRowLinkSchema,
  journal: v.string(),
  addDecorations: v.boolean(),
});

const navBlockSchema = v.object({
  type: v.picklist(["create", "existing"]),
  rows: v.array(navBlockRowSchema),
  decorateWholeBlock: v.boolean(),
});

export type ColorSettings = v.InferOutput<typeof colorSettingsSchema>;
export type NavBlockRowLink = v.InferOutput<typeof navBlockRowLinkSchema>;
export type NavBlockRow = v.InferOutput<typeof navBlockRowSchema>;
export type JournalNavBlock = v.InferOutput<typeof navBlockSchema>;
```

Added to `journalConfigSchema` alongside the other optional fields:

```ts
navBlock: v.optional(navBlockSchema, () => ({
  type: "create",
  rows: [],
  decorateWholeBlock: false,
})),
```

The optional default is intentionally **empty rows** — same dual-default pattern v3 already uses for `templates`, `folder`, etc. Existing parsed configs that lack `navBlock` get the empty value; user intent is never silently overwritten with stock rows on first load.

The **rich** per-write-type rows port v2's `defaultNavBlocks` 1:1 and live in `journalDefaultsFor(write, name)`. They apply only when callers explicitly construct a default config (new-journal flow, new-write-type switch). Every default block uses `type: "create"` and `decorateWholeBlock: false`.

Shared row fragments (v3 ports of v2's helpers in `journal-defaults.ts`):

```ts
const emptyNavRow: NavBlockRow = {
  template: "",
  fontSize: 1,
  bold: false,
  italic: false,
  link: "none",
  journal: "",
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  addDecorations: false,
};

const rowNavWeek = { ...emptyNavRow, template: "{{date:[W]w}}", link: "week" } as const;
const rowNavMonth = { ...emptyNavRow, template: "{{date:MMMM}}", link: "month" } as const;
const rowNavYear = { ...emptyNavRow, template: "{{date:YYYY}}", link: "year" } as const;
const rowNavRelative = { ...emptyNavRow, template: "{{relative_date}}", fontSize: 0.7 } as const;
```

Per-write-type rows:

| Write type | Rows (in order)                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `day`      | `{{date:ddd}}` · `{{date:D}}` (fontSize 3, bold, link `self`, addDecorations) · `rowNavRelative` · `rowNavWeek` · `rowNavMonth` · `rowNavYear` |
| `week`     | `rowNavWeek` overridden with fontSize 3 + bold + link `self` + addDecorations · `rowNavRelative` · `rowNavMonth` · `rowNavYear`                |
| `month`    | `rowNavMonth` overridden with fontSize 3 + bold + link `self` + addDecorations · `rowNavRelative` · `rowNavYear`                               |
| `quarter`  | `{{date:[Q]Q}}` (fontSize 3, bold, link `self`, addDecorations) · `rowNavRelative` · `rowNavYear`                                              |
| `year`     | `rowNavYear` overridden with fontSize 3 + bold + link `self` + addDecorations · `rowNavRelative`                                               |
| `custom`   | `{{journal_name}} {{index}}` (fontSize 3, bold, link `self`, addDecorations) · `{{start_date}}` · `to` · `{{end_date}}`                        |

These rows are copied directly from `src/_old-code/journals/journal-defaults.ts` (lines 53–163). The constants (`emptyNavRow`, `rowNavWeek`, `rowNavMonth`, `rowNavYear`, `rowNavRelative`) live alongside `journalDefaultsFor` in `src/journals/config.ts`.

`journals/config.test.ts` adds cases:

- `safeParse` accepts a full `navBlock` round-trip.
- `safeParse` of a config without `navBlock` fills the empty default.
- one test per write type asserts `journalDefaultsFor(write).navBlock.rows` matches the v2-equivalent row list (row count, every template string, every `link`, every `addDecorations`/`bold`/`fontSize` override).

## Code-block definition — `src/code-blocks/nav/nav-block.ts`

```ts
export const navigationCodeBlock = defineCodeBlock({
  keys: ["journal-nav", "calendar-nav", "interval-nav"],
  schema: v.object({}),
  component: NavigationCodeBlock,
  cssClass: ["journal-nav-code-block"],
});
```

All three v2 keys are aliases under one definition. `v.object({})` accepts any shape and yields `{}`; the foundation's empty-source branch yields the same. `src/code-blocks/module.ts` adds `c.register(CodeBlockDefinitionToken).useValue(navigationCodeBlock)` alongside `homeCodeBlock`.

## Top-level component — `NavigationCodeBlock.vue`

Props:

```ts
const { path } = defineProps<CodeBlockProps<Record<string, never>>>();
```

Services pulled via `useService`: `JournalsRepository`, `JournalsIndex`, `CycleService`, `ShelvesRepository`, `Flows`, `WorkspaceService`, `TemplateEngine`.

Reactive derivations:

- `entry = index.entryByPath(path)` → `Option<JournalEntry>`.
- `journal = journals.get(entry.journalName)` → `Option<JournalConfig>`.
- `currentPeriod` / `previousPeriod` / `nextPeriod`: built from each ref anchor via `periodForJournal(journal.write, anchor)` (see _Period construction_ below). The decoration engine keys by anchor string only, so the chosen `Period.kind` matters only for `periodMatchesWrite`.
- `previousRef` / `nextRef`: pair of `{ anchor, period }` resolved by `navBlock.type`:
  - `"create"`: `cycle.previousAnchor(name, anchor)` / `.nextAnchor(...)`.
  - `"existing"`: `index.findPrevious(name, anchor)` / `.findNext(...)` (returns the **adjacent existing** entry's anchor; column renders empty when `none`).
- `shelfJournals`: lookup the note's shelf via `ShelvesRepository.find().list()`, filter to journals sharing the note journal's `write.type`. This is the `journalNames` set passed to `useCellDecorations` (matches v2's `decorations[journal.type]` semantics).

`useCellDecorations(periodsRef, shelfJournals)` is called once. The provided `CellDecorationMapKey` map covers all three anchors; `<CellDecoration>` inside `NavBlock`/`NavBlockRow` reads it.

Render:

- If `entry.isNone()` or `journal.isNone()` → `<div class="journal-nav-not-connected">{{ m.code_blocks_nav_not_connected() }}</div>`.
- Otherwise: a flex row with five slots — `<NavBlock>` (previous, may be empty placeholder), prev arrow `IconButton`, `<NavBlock>` (current), next arrow `IconButton`, `<NavBlock>` (next, may be empty placeholder). Arrows render only when the corresponding ref anchor exists.
- Arrow click → `flows.invoke(OpenDateFlow, { anchor, journalNames: [journal.name], existingOnly: navBlock.type === "existing", openMode: defineOpenMode(event) })`.

Layout/styles port v2's `NavigationCodeBlock.vue` 1:1 (centered flex row, icon-size token, prev/next positioned absolutely beside their column).

## Column component — `NavBlock.vue`

Props: `{ journal: JournalConfig, refDate: AnchorString, period: Period, journalName: string, preventNavigation?: boolean }`.

- If `journal.navBlock.decorateWholeBlock`: wrap the row list in `<CellDecoration :period="period">`.
- For each row in `journal.navBlock.rows`: render `<NavBlockRow :journal :row :ref-date="refDate" :period="period" :prevent-navigation="preventNavigation" />`.

No business logic — pure render-and-forward.

## Row component — `NavBlockRow.vue`

Props: `{ journal: JournalConfig, row: NavBlockRow, refDate: AnchorString, period: Period, preventNavigation?: boolean }`.

Computed text:

```ts
const text = computed(() =>
  engine.renderString(
    row.template,
    buildNavRowContext({
      journal,
      refDate,
      entry: index.entryByAnchor(journal.name, refDate),
      cycle,
      today: Clock.now().format("YYYY-MM-DD") as AnchorString,
    }),
  ),
);
```

Styles: inline via CSS `v-bind` for `fontSize` (em), `fontWeight`, `fontStyle`, `color`, `backgroundColor`, and `cursor` (derived from `link-targets.ts` — "clickable" iff resolves to a non-empty list, mirroring v2's `isClickable`).

If `row.addDecorations` → wrap text in `<CellDecoration :period="period">`.

Handlers (no-op when `preventNavigation` is true or the resolver yields `{ kind: "none" }`):

- `@click.prevent`: resolve target via `resolveLinkTarget(row, journal, shelf, shelfJournalsByType)`; for `kind: "self"` call `workspace.openNote(entry.path)`; otherwise `flows.invoke(OpenDateFlow, { anchor: refDate, journalNames, existingOnly: false, openMode: defineOpenMode(event) })`.
- `@contextmenu`: resolve to candidate `JournalEntry`s via `index.entryByAnchor(name, refDate)`; one match → `workspace.openFileMenu(path, event)`; multiple → `new obsidian.Menu()` with one item per path, each opening `openFileMenu` (matches v2 + `useNotesCell` pattern).
- Hover with ctrl/cmd: `workspace.triggerHoverPreview(firstPath, event)` (same gesture as `useNotesCell.openPreview`).

## Pure helpers

### `link-targets.ts`

```ts
export type LinkTarget =
  | { kind: "none" }
  | { kind: "self"; path: VaultPath }
  | { kind: "open"; journalNames: readonly string[] };

export function resolveLinkTarget(
  row: NavBlockRow,
  noteJournal: JournalConfig,
  shelfJournals: readonly JournalConfig[],
  noteEntry: Option<JournalEntry>,
): LinkTarget;
```

Rules:

- `row.link === "none"` → `{ kind: "none" }`.
- `row.link === "self"` → if `noteEntry.isSome()` → `{ kind: "self", path: noteEntry.value.path }`; else `{ kind: "none" }`.
- `row.link === "journal"` → if `row.journal` is non-empty → `{ kind: "open", journalNames: [row.journal] }`; else `{ kind: "none" }`.
- `row.link` is a period kind → `{ kind: "open", journalNames: shelfJournals.filter(j => j.write.type === row.link).map(j => j.name) }`; empty list collapses to `{ kind: "none" }`.

### `nav-row-context.ts`

```ts
export interface NavRowContextInputs {
  journal: JournalConfig;
  refDate: AnchorString;
  entry: Option<JournalEntry>;
  cycle: CycleService;
  today: AnchorString;
}

export function buildNavRowContext(inputs: NavRowContextInputs): TemplateContext;
```

Returns a `TemplateContext.empty()` populated with:

| Variable        | Kind   | Source                                                                                                                     |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `date`          | date   | `CalendarDate.fromAnchor(refDate)`, defaultFormat = `journal.dateFormat`                                                   |
| `start_date`    | date   | `cycle.startOf(journal.name, refDate)` (fallback: `date`)                                                                  |
| `end_date`      | date   | `cycle.endOf(journal.name, refDate)` (fallback: `date`)                                                                    |
| `relative_date` | string | `periodKindFor(journal.write)` → `null` for custom (substitute `""`); otherwise `relativeDate(periodKind, refDate, today)` |
| `journal_name`  | string | `journal.name`                                                                                                             |
| `index`         | number | `entry.value.numbers?.["index"]` when present; omitted from context otherwise                                              |

`relativeDate` is the helper introduced by the home-block spec. `periodKindFor(write)` returns `write.type` for fixed writes and `null` for custom (caller substitutes `""`).

## Period construction

Custom-write journals have no `Period` of their own kind. Decoration matching uses `periodMatchesWrite`, which returns `true` for `("day", "custom")`. So:

```ts
function periodForJournal(write: JournalWrite, anchor: AnchorString): Period {
  const date = CalendarDate.fromAnchor(anchor);
  return match(write)
    .with({ type: "day" }, () => new DayPeriod(date))
    .with({ type: "week" }, () => new WeekPeriod(date))
    .with({ type: "month" }, () => new MonthPeriod(date))
    .with({ type: "quarter" }, () => new QuarterPeriod(date))
    .with({ type: "year" }, () => new YearPeriod(date))
    .with({ type: "custom" }, () => new DayPeriod(date))
    .exhaustive();
}
```

(Exact constructor signatures match `src/calendar/period-*.ts`; the helper lives next to the component file.) The same anchor is used by `JournalsIndex.entryByAnchor` for the row's text-context lookup and by `CellDecoration` for the decoration map key, so the period kind discrepancy for custom journals is purely internal to `periodMatchesWrite`.

## Decorations integration

Single `useCellDecorations` call in `NavigationCodeBlock.vue`:

- `periodsRef`: `[previousPeriod?, currentPeriod, nextPeriod?].filter(notNullish)` — at most three entries.
- `journalNamesRef`: the shelf-grouped journal set described above.

`<CellDecoration>` consumes the provided `CellDecorationMapKey` map. Per-row (`addDecorations`) and whole-block (`decorateWholeBlock`) flags only decide whether to render the wrapping `<CellDecoration>` element; the decoration data flow is identical regardless of which wrapper triggers it. Custom-write journals participate normally — they simply contribute decorations only against anchors that match their own cycle.

## Error handling

| Surface                                                 | Behavior                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Path not in any journal entry                           | Inline `<div>` with `m.code_blocks_nav_not_connected()` — i18n key replacing v2's literal.   |
| `entryByPath` resolves but `journals.get(name)` is none | Same fallback (config drift); logged at debug level.                                         |
| `entryByAnchor` returns none for a row's ref anchor     | Decoration map miss falls through to empty styles; row text still renders.                   |
| `OpenDateFlow` returns `NoApplicableJournals`           | Existing flow log/notice path; click is a visible no-op.                                     |
| Template render                                         | `TemplateEngine.renderString` is total.                                                      |
| YAML/schema parse                                       | Unreachable (`v.object({})` accepts any source); foundation paths still cover the assertion. |

No new error classes — the foundation already owns the YAML/schema branches.

## i18n

New key:

- `code_blocks_nav_not_connected` → `"Note is not connected to a journal"` (v2 wording).

No other user-facing strings — row text comes from the journal's templates and `relativeDate` (which has its own keys under `code_blocks.home.relative_date.*` already).

## Testing

| Subject                          | File                                             | Style                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navBlockSchema` parse + default | `journals/config.test.ts` (added cases)          | `v.safeParse` round-trip; absent-field default = `{ type: "create", rows: [], decorateWholeBlock: false }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `journalDefaultsFor` per type    | same file                                        | one test per write.type asserts row count + first-row template, mirroring v2's `defaultNavBlocks`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `link-targets.ts`                | `code-blocks/nav/link-targets.test.ts`           | pure literal inputs; covers `none`, `self` with/without entry, `journal` with empty/non-empty name, each period kind with empty + non-empty shelf matches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `nav-row-context.ts`             | `code-blocks/nav/nav-row-context.test.ts`        | pure; one test per variable; custom-journal yields `relative_date === ""`; `index` omitted when entry has no `numbers`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `NavigationCodeBlock` end-to-end | `code-blocks/nav/ui/NavigationCodeBlock.test.ts` | `@testing-library/vue` + container fixture with fakes for `JournalsRepository`/`JournalsIndex`/`CycleService`/`ShelvesRepository`/`Flows`/`WorkspaceService`. Cases: not-connected message; "create" prev/next via cycle; "existing" prev/next via index; arrow click dispatches `OpenDateFlow` with `existingOnly` matching the type; row click resolves to `OpenDateFlow` for period kinds; row click on `self` calls `workspace.openNote`; right-click on row with one match opens `openFileMenu`; right-click with multiple matches opens an obsidian `Menu`; ctrl-hover triggers `triggerHoverPreview`; `decorateWholeBlock` wraps the column; `addDecorations` wraps the row text. |

Explicitly **not** tested: `defineCodeBlock` value, `codeBlocksModule` shape, `main.ts` wiring, the `colorToString` helper (trivial), the fakes themselves. No standalone `NavBlock`/`NavBlockRow` tests — observed through the integration suite.

Verification gates before completion: `npm test`, `npm run check:types`, `npm run check:lint`.
