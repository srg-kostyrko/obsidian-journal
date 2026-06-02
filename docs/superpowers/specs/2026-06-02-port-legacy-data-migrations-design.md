# Port legacy data migrations to v3

Date: 2026-06-02
Branch: `v3-ai`

## Problem

The v3 rewrite replaced the old monolithic settings blob with per-feature
slices and collections (`src/settings/`), but never ported the data
migrations. An existing user's `data.json` still holds one of three legacy
shapes:

- **v1** — legacy plugin, no `version` field.
- **v2** — monolithic `{ version: 2, journals, shelves, commands, calendar, calendarView, ... }`.
- **v3** — same monolithic shape with `version: 3` (the released plugin's
  final format).

The new slice/collection code carries `CURRENT_VERSION = 3` and was simply
left unbumped during the port — no real vault ever persisted the new shape at
version 3. So today the migration runner runs nothing for an existing user and
the lenient slice parsers reset every journal, shelf, and command to defaults:
silent, total data loss.

This spec ports the old migrations into the v3 migration framework
(`MigrationToken` + `runMigrations`), non-interactively, and adds a one-time
runtime pass to rewrite legacy v1 note frontmatter.

The old (v2) interactive migration flow — modals for shelf grouping and
frontmatter decisions, `pendingMigrations` — is **not** ported. Sensible
defaults replace it.

## Decisions

| Topic                    | Decision                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Version model            | `CURRENT_VERSION` 3 → **4**; three migrations `0→2`, `2→3`, `3→4`                                             |
| `version: 3` ambiguity   | None — v3 always means old-monolithic-v3; no shape sniffing                                                   |
| Code location            | Dedicated `src/settings/legacy/`, registered via a dedicated `legacyMigrationsModule`                         |
| Legacy type shapes       | Migration-local `old-shapes.ts` (frozen snapshot, no `_old-code` import)                                      |
| v1→v2 interactivity      | Dropped; non-interactive with defaults below                                                                  |
| Calendar split default   | One journal per enabled section, grouped under a shelf named after the old journal; `keepFrontmatter = false` |
| Section journal names    | `"{old name} {section}"` (e.g. `"My Journal Day"`); global dedup allocator                                    |
| Note frontmatter rewrite | In scope, as a one-time runtime `DataMigrationService` after `autoLoad`                                       |
| `weekdays` write type    | Not handled — no UI ever created one                                                                          |
| `calendarView` mapping   | Map `leaf`/`weeks`/`display`/`todayMode`/`pickMode` + styles; nothing dropped                                 |
| Generated collection ids | `nanoid()`                                                                                                    |

## Version chain

`CURRENT_VERSION` becomes **4**. Three migrations registered on
`MigrationToken`:

| from→to   | input shape              | does                                                |
| --------- | ------------------------ | --------------------------------------------------- |
| **0 → 2** | legacy v1 (no `version`) | port `migrateV1toV2`, non-interactive               |
| **2 → 3** | old monolithic v2        | port `migrateV2toV3` (trivial field adds)           |
| **3 → 4** | old monolithic v3        | reshape monolithic blob → new slice/collection keys |

`runMigrations` reads `version` (missing = 0): legacy v1 enters at `0→2`, v2 at
`2→3`, v3 at `3→4`. A fresh install resolves to `{ version: 4 }` (see
`SettingsService.initialize`) and runs nothing. The `3→4` reshape assumes the
old-monolithic shape unconditionally.

`0→2` and `2→3` emit the **old monolithic shape** verbatim — they are the seam
that lets `3→4` do the single reshape for every legacy origin.

## File layout

```
src/settings/legacy/
  v1-to-v2.ts          Migration {0→2} + ported helpers
                       (prepareCalendarJournalSettings / prepareIntervalJournalSettings)
  v2-to-v3.ts          Migration {2→3}
  v3-to-v4.ts          Migration {3→4} — monolithic → slices
  old-shapes.ts        frozen local types for the legacy blobs
  data-migration-service.ts  runtime note-frontmatter rewrite
  module.ts            legacyMigrationsModule — registers migrations + service
  index.ts             barrel (public surface only)
  v1-to-v2.test.ts
  v2-to-v3.test.ts
  v3-to-v4.test.ts
  chain.test.ts        full 0→2→3→4 composition
  data-migration-service.test.ts
```

- `src/settings/version.ts` → `export const CURRENT_VERSION = 4;`
- `old-shapes.ts` declares migration-local `interface`s for the legacy input
  (`PluginSettingsV1`, `CalendarConfig`, `IntervalConfig`, old monolithic
  `PluginSettings`/`JournalSettings`). Copied/trimmed from `_old-code`, **not**
  imported, so `_old-code` stays deletable and the migrations parse a frozen
  snapshot.
- `calculateDoy` (currently in `_old-code`'s `@/calendar`) is ported into
  `legacy/` so the migration output never shifts if current calendar logic
  changes.
- `defaultCommands` (the old default "Open …" command list from
  `_old-code/defaults.ts`) is a frozen local copy in `legacy/`.

## Migration `0→2` (v1 → v2, non-interactive)

Ports `prepareCalendarJournalSettings` / `prepareIntervalJournalSettings` from
`_old-code` into a pure data transform. The modal + `pendingMigrations`
interactive flow is dropped; defaults replace the user decisions it collected.

**Calendar journal** (`CalendarConfig`):

- One v2 journal per **enabled** section (`day`/`week`/`month`/`quarter`/`year`).
- Per-section journal name = `"{old name} {section}"`.
- All sections grouped under a **shelf named after the old journal**.
- `keepFrontmatter = false` → no `addStartDate`/`addEndDate`.

**Interval journal** (`IntervalConfig`):

- One v2 journal, name = old name (subject to dedup below).
- Index reset math, nav rows, ribbon→command, end-condition mapping — ported
  verbatim from `prepareIntervalJournalSettings`.

**Calendar settings:** `calendar.dow = firstDayOfWeek`,
`calendar.doy = calculateDoy(firstDayOfWeek, firstWeekOfYear)`. The v1 locale
sentinel `firstDayOfWeek === -1` is carried through as-is (`doy = 1`) and
resolved to `{ mode: "locale" }` later by `3→4`.

**Name uniqueness:** the old monolithic shape keys journals by **name**
(`Record<name, JournalSettings>`) and v3 looks journals up by name everywhere
(`CycleService.anchorOf`, `JournalsRepository.get`, note `journal` frontmatter).
Duplicate names collapse. All proposed names (interval names + calendar-section
names) run through a single allocator that appends ` 2`, ` 3`, … on collision.

**`pendingNoteMigration` marker:** instead of `pendingMigrations`, `0→2`
records a marker into the data for the runtime note pass:

```ts
type PendingNoteMigration =
  | { oldJournalId: string; kind: "interval"; name: string }
  | {
      oldJournalId: string;
      kind: "calendar";
      sectionToName: Partial<Record<"day" | "week" | "month" | "quarter" | "year", string>>;
    };
```

Names recorded are the **final allocated** (post-dedup) names, so the note pass
targets the real journal names and dedup stays invisible to it. The marker is
stored under a key that survives `2→3`/`3→4` untouched and is parsed by its own
slice (see Runtime pass).

## Migration `2→3`

Direct port of `migrateV2toV3` — field back-fills on the monolithic blob:

```ts
{ fromVersion: 2, toVersion: 3, migrate(raw) {
    raw.commands ??= defaultCommands;        // frozen local copy
    for (const shelf of Object.values(raw.shelves ?? {})) shelf.commands ??= [];
    raw.dismissedNotifications ??= [];
    return raw;                              // version set to 3 by the runner
} }
```

Output remains the old monolithic v3 shape.

## Migration `3→4` (monolithic → new slices/collections)

Reshapes the monolithic blob onto the new top-level keys. Output is consumed by
the slice/collection parsers, which validate leniently.

| monolithic key                                                                      | → new key                                 | mapping                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `journals{}` _(JournalSettings)_                                                    | `journals` collection _(JournalConfig)_   | per-journal map below                                                                                                                        |
| `shelves{}` _(name, journals, commands)_                                            | `shelves` collection _(name, journals)_   | drop `commands` → emit into `commands` with `target:{kind:"shelf", shelfName, writeType}`                                                    |
| `commands[]` _(PluginCommand)_                                                      | `commands` collection                     | `{name, icon, showInRibbon, openMode, type, context:"today", target:{kind:"all", writeType}}`                                                |
| `calendar{dow,doy,global}`                                                          | `calendar` slice                          | `dow === -1` → `{mode:"locale"}`; else `{mode:"custom", dow, doy, global}`                                                                   |
| `calendarView.todayStyle/activeStyle`                                               | `appearance` slice                        | `{today:{color,background}, active:{color,background}}`                                                                                      |
| `calendarView.{leaf,weeks,display,todayMode,pickMode}`                              | seeded default view in `views` collection | update the calendar block's config (block schema confirmed during implementation; `todayMode`/`pickMode` → their corresponding view buttons) |
| `openOnStartup` _(string name)_                                                     | `startup` slice                           | `{journalName: openOnStartup}`                                                                                                               |
| `pendingNoteMigration`                                                              | carried forward verbatim                  | the marker `0→2` wrote; consumed by the runtime pass                                                                                         |
| `ui`, `useShelves`, `showReloadHint`, `pendingMigrations`, `dismissedNotifications` | dropped                                   | no v3 equivalent                                                                                                                             |

Because `3→4` builds a fresh object keyed by the new slice/collection names, it
must **explicitly copy `pendingNoteMigration` forward** — it is not a
passthrough of unknown keys.

**Per-journal `JournalSettings` → `JournalConfig`:**

- Carried as-is (shape-compatible): `name`, `write`, `confirmCreation`,
  `autoCreate`, `nameTemplate`, `dateFormat`, `folder`, `templates`,
  `decorations`, `navBlock`.
- `start` + `end{type,date,repeats}` → `timeline{ start, end{kind,date,count} }`
  (`type`→`kind`, `repeats`→`count`).
- `index{enabled,anchorDate,anchorIndex,allowBefore,type,resetAfter}` +
  `frontmatter.indexField` →
  `numbering{ enabled, anchorDate, allowBefore,
  sources:[{ variable:"index", frontmatterKey: indexField,
    anchorValue: anchorIndex,
    reset: type === "reset_after" ? {kind:"after",count:resetAfter} : {kind:"never"} }] }`.
- `calendarViewBlock{rows,decorateWholeBlock}` →
  `intervalBlock{ type:"create", rows, decorateWholeBlock }`.
- `frontmatter{dateField,startDateField,endDateField,addStartDate,addEndDate}` →
  carried (`indexField` moved into `numbering` above).
- per-journal `commands[]` → emitted into the `commands` collection with
  `target:{kind:"journal", journalName: name}`.

**Collection ids:** journals/shelves/commands items are keyed by a generated
`nanoid()`; `name` is carried inside each item. The `pendingNoteMigration`
marker references journals by **name**, which items preserve, so the note pass
still resolves. The `views` collection's keys are `v.uuid()`-validated, but
`3→4` only updates the **seeded** default calendar view, never mints a view id.

**`weekdays` write type:** not handled — no UI path ever created one. If an
impossible hand-edited blob carried it, the lenient parser resets that one
journal.

**decorations:** carried across; a field-by-field diff of v2 `JournalDecoration`
vs v3 `decorationSchema` is done during implementation. The lenient parser is
the backstop (a mismatched item resets to that journal's default decorations).

## Runtime note-frontmatter rewrite

Settings migrations are pure data and cannot touch the vault. A one-time runtime
service rewrites **legacy v1 notes** — the only notes that need it. v2/v3 notes
already use the v3 frontmatter keys (`journal` = name, `journal-date`, etc.),
confirmed against `_old-code`'s `updateFrontmatter*`.

**Bridge — `pendingNoteMigration` slice:**

- A new slice in `src/settings/legacy/` (registered via `legacyMigrationsModule`)
  whose schema is `v.array(pendingNoteMigrationSchema)`, default `[]`.
- Written by `0→2`; passes through `2→3`/`3→4` untouched; parsed as its own
  slice on load.
- Empty `[]` by default → the service no-ops on every normal launch.

**`DataMigrationService.initialize(): AsyncResult<void, never>`** (registered in
`legacyMigrationsModule`, called from `main.ts` after `container.autoLoad()`,
beside the other startup services):

1. Read the `pendingNoteMigration` slice; if empty, return ok.
2. For each markdown note (`NotesService.allMarkdownNotes()` +
   `NoteMetadataService.get()`): if its `journal` frontmatter matches a marker's
   `oldJournalId`:
   - Resolve target v3 name — interval: `name`; calendar:
     `sectionToName[note's journal-section]`.
   - `CycleService.anchorOf(name, date)`:
     - resolved → `NotesService.updateFrontmatter()` to set `journal` = name,
       `journal-date` = date, move `journal-interval-index` → `journal-index`,
       drop `journal-section`; honor `addStartDate`/`addEndDate` (false by
       default, so the start/end keys are removed).
     - unresolved / orphan → strip the journal keys.
   - Reuse `FrontmatterService` mutator builders where they fit rather than
     hand-writing key juggling.
3. Set the slice back to `[]` so it never re-runs.

Runs **after** journals are registered (marker names exist in
`JournalsRepository`), which is why it is a post-`autoLoad` runtime pass, not
part of the migration runner. Idempotent by construction.

Relevant v3 services (verified by reading `src/`):

| Need                         | Service / method                                   |
| ---------------------------- | -------------------------------------------------- |
| iterate notes                | `NotesService.allMarkdownNotes()`                  |
| read frontmatter             | `NoteMetadataService.get(path)` → `.properties`    |
| mutate frontmatter           | `NotesService.updateFrontmatter(path, mutate)`     |
| resolve anchor               | `CycleService.anchorOf(name, date)`                |
| journal config / field names | `JournalsRepository.get(name)`                     |
| build/clear mutators         | `FrontmatterService.writeMutator` / `clearMutator` |

## Testing

- **Pure-data migrations** (`v1-to-v2`, `v2-to-v3`, `v3-to-v4`): table-driven
  unit tests with realistic legacy fixtures (a multi-section calendar journal,
  an interval journal, shelves, commands, locale-vs-custom calendar). Assert the
  exact resulting shape. Cover name-dedup collisions, `dow === -1` → locale,
  index→numbering reset math, `pendingNoteMigration` marker contents. Colocated.
- **Chain test**: one fixture through `runMigrations(rawV1, allMigrations, 4)`,
  asserting the final new-slice shape — proves `0→2→3→4` composes.
- **`DataMigrationService`**: tested against the host fakes
  (`NotesService`/`NoteMetadataService`), asserting observable frontmatter
  outcomes (keys renamed, `journal-section` dropped, orphans stripped, marker
  cleared). Black-box; one behavior per test.
- No tests for module/wiring registration (repo convention).
- Gates: `npm run test`, `npm run check:types`, `npm run check:lint`.

## Implementation phases

The design is one cohesive story but implements in two natural phases, bridged
by the `pendingNoteMigration` marker:

- **Phase A — settings reshape** (pure data): `version.ts` bump, `old-shapes.ts`,
  `v1-to-v2`, `v2-to-v3`, `v3-to-v4`, the `pendingNoteMigration` slice,
  `legacyMigrationsModule` registration, and all pure-data tests.
- **Phase B — runtime note pass**: `DataMigrationService`, its `main.ts` wiring,
  and its fake-backed tests.

## Out of scope

- The v2 interactive migration UI (modals, `pendingMigrations`, the
  `MigrationModal.vue` family).
- Adding `weekdays` write support to v3.
- Deleting `src/_old-code/` (tracked separately).
