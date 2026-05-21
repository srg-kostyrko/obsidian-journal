# v3 Dynamic Commands — Design

## Goal

Replace v2's three separate user-command stores with a single settings
collection. Every user-configurable command has one shape; whether a command
applies globally or to a specific journal is expressed entirely by its `target`
descriptor.

This builds on the v3 command foundation (`CommandService`, the built-in
`open-next`/`open-prev`). That foundation already registers Obsidian commands
by stable `id`; this spec adds the user-configurable commands on top.

## Scope

In scope:

- A single `commands` settings collection, keyed by generated id.
- Command resolution: which journals a command applies to, and the target date
  it resolves to.
- A registry that registers/unregisters Obsidian commands live as the
  collection changes.
- A journal rename/delete cascade for `journal`-target commands, delivered
  through journal lifecycle domain events.

Out of scope (follow-up spec):

- The settings UI for creating, editing, and deleting commands.
- Shelves and a `shelf` target — shelves do not exist in v3 yet. The `target`
  descriptor is a discriminated union, so a `shelf` variant can be added later
  without reshaping existing commands.
- The remaining v2 built-ins (`connect-note`, `open-calendar`,
  `change-calendar-shelf`) — each depends on a v3 feature that does not exist
  yet.

## Background: v2 command model

User-configurable commands lived in three places: global (`config.commands`),
per shelf (`shelf.commands`), and per journal (`journal.commands`). The first
two shared the `PluginCommand` shape (`writeType` + a 3-value `type`); per
journal commands used `JournalCommand` with a 9-value `type` and a `context`
field. v3 collapses all three into one collection and one shape.

## Location

A top-level `src/commands/` feature: `config.ts`, `resolve.ts`,
`command-registry.ts`, `module.ts`, `index.ts`. It depends on `journals`
(journal write types, `JournalsIndex`, `OpenDateFlow`, lifecycle events),
`settings`, and `host`. `journals` has no dependency back on `commands`.
`commandsModule` is added in `main.ts` alongside the other feature modules.

The existing built-in `JournalNavigationCommands` (`open-next`/`open-prev`)
stays in `journals/` — it shipped there, and moving it is unrelated to this
work.

## Component 1 — the command collection

Location: `commands/config.ts`. A `defineCollection` keyed by a generated
unique id. The id doubles as the Obsidian command id when the registry calls
`CommandService.register`.

```ts
type CommandTarget =
  | { kind: "all"; writeType: "day" | "week" | "month" | "quarter" | "year" }
  | { kind: "journal"; journalName: string };

type CommandType =
  | "same"
  | "next"
  | "previous"
  | "same_next_week"
  | "same_previous_week"
  | "same_next_month"
  | "same_previous_month"
  | "same_next_year"
  | "same_previous_year";

type CommandContext = "today" | "open_note" | "only_open_note";

interface CommandConfig {
  name: string;
  icon: string;
  showInRibbon: boolean;
  openMode: OpenMode;
  target: CommandTarget;
  type: CommandType;
  context: CommandContext;
}
```

Every field is identical for `all` and `journal` commands — the only variation
is the `target` discriminated union. v2's `writeType` filter moves inside the
`all` variant; a `journal` command derives its write type from the journal
config. The `all` variant excludes `custom`: v2's global commands only ever
applied to fixed-write journals, and "next" in a heterogeneous set of custom
cycles has no single answer.

The collection's `defaultItem(id)` returns a complete `CommandConfig` with
neutral defaults — it is the fallback when a stored entry fails to parse, and
the seed the follow-up settings UI starts an edit from.

## Component 2 — resolution

Location: `commands/resolve.ts`. Pure functions, no DI.

- `supportedTypes(writeType)` — ports v2's `buildSupportedCommandList`:
  - `day` → all 9 variants.
  - `week`, `year`, `custom` → `same`, `next`, `previous`.
  - `month`, `quarter` → those three plus `same_next_year`,
    `same_previous_year`.
- `compoundShift(type)` → `{ amount, unit } | null` — maps the six compound
  variants to a calendar shift (`same_next_week` → `+1 w`, `same_previous_year`
  → `-1 y`, etc.); returns `null` for `same`/`next`/`previous`.

Applying the offset to produce an anchor is **not** pure — `next`/`previous` on
a custom journal depends on that journal's cycle. The registry (Component 3)
owns anchor resolution, delegating to the existing `CycleService`, which
already handles fixed and custom write types uniformly by journal name:

- `same` → `CycleService.anchorOf(journalName, referenceDate)`.
- `next` → `anchorOf` then `CycleService.nextAnchor`.
- `previous` → `anchorOf` then `CycleService.previousAnchor`.
- a compound variant → shift the reference date by `compoundShift(type)`, then
  `anchorOf`.

For an `all` target every candidate journal shares one fixed write type, so any
candidate's name resolves the same anchor. Resolution yields a single anchor
date; `OpenDateFlow` snaps it to each journal's period entry.

The reference date depends on `context`:

- `today` → `CalendarDate.today()`.
- `open_note` → the active note's journal-entry anchor, falling back to today
  when no journal note is active.
- `only_open_note` → the active note's journal-entry anchor, with no fallback.

## Component 3 — `DynamicCommandRegistry`

Location: `commands/command-registry.ts`. An eager service. It injects
`CommandService`, `SettingsService`, `Flows`, `WorkspaceService`,
`JournalsIndex`, `CycleService`, `JournalLifecycleService`, and a `Logger`.

It owns two responsibilities: keeping the command collection consistent with
the journals it references, and keeping Obsidian's registered commands
consistent with the collection.

It exposes an explicit `initialize()`. `SettingsService.getCollection` throws
until settings have loaded, and `container.autoLoad()` constructs eager
services before that — so the constructor does no work, and `main.ts` calls
`initialize()` after `SettingsService.initialize()`, alongside the other
settings-dependent services (`VaultSubscriptionService`, `AutoAttachService`,
`AutoCreateService`).

### Reconciling registrations

`initialize()` runs a first reconcile, then Vue-`watch`es the command
collection deeply (`flush: "sync"`). On every change it reconciles: it tracks
each registered id against the command's serialized value, calls
`CommandService.unregister` for ids that vanished or changed, and `register`
for ids that are new or changed (a change is an unregister followed by a
register).

Each `CommandRegistration` it builds:

- `id` — the collection key.
- `name`, `icon` — from the `CommandConfig`.
- `ribbon` — the `showInRibbon` flag.
- `check` — true when there is at least one candidate journal, the command's
  `type` is in `supportedTypes(writeType)`, the reference and target anchors
  resolve, and — for `only_open_note` context — the active note belongs to a
  candidate journal.
- `execute` — resolve the target anchor, then
  `Flows.invoke(OpenDateFlow, { anchor, journalNames, openMode, existingOnly: false })`.
  `OpenDateFlow` already handles the multi-journal picker and note creation.
  `UserAborted` and `NoApplicableJournals` are swallowed quietly (v2 did
  nothing in those cases); other errors are logged.

Candidate journals:

- `all` target → every journal whose `write.type` equals `target.writeType`.
- `journal` target → the named journal, if it still exists.

`journalNames` passed to `OpenDateFlow` is the candidate set.

### Cascading journal lifecycle changes

`initialize()` also subscribes to `JournalLifecycleService.events`:

- `journalRenamed` → rewrite `journalName` on every `journal`-target command
  pointing at the old name.
- `journalDeleted` → remove every `journal`-target command pointing at the
  deleted journal.

Those collection edits flow through the same `watch` reconcile path as direct
user edits, so registrations update automatically.

## Component 4 — journal lifecycle domain events

`JournalLifecycleService` (in `journals/settings/lifecycle.ts`) stays unaware
of commands. It gains a `TypedEmitter<JournalLifecycleEvents>` — the same
nanoevents pattern `JournalsIndex` already uses — exposed as a
`events: Subscribable<JournalLifecycleEvents>` field.

```ts
interface JournalLifecycleEvents {
  journalRenamed: (payload: { oldName: string; newName: string }) => void;
  journalDeleted: (payload: { journalName: string }) => void;
}
```

`rename` emits `journalRenamed` after the collection mutation succeeds;
`delete` emits `journalDeleted` after a successful removal. These are plain
domain events, useful to any future consumer — not command-specific.

A watcher cannot infer a rename: a rename is a collection `remove` plus an
`add`, indistinguishable from a delete followed by an unrelated create. The
explicit event at the mutation chokepoint is what makes the rename cascade
correct.

## Wiring

`commands/module.ts` exports `commandsModule` — a zero-arg `Module` value. It
registers the collection definition via `CollectionDefinitionToken` and
registers `DynamicCommandRegistry` eager. `main.ts` adds `commandsModule` and,
after `SettingsService.initialize()` succeeds, calls
`container.resolve(DynamicCommandRegistry).initialize()`.

## Testing

- `resolve.ts` — `supportedTypes` for each write type; `compoundShift` for the
  compound and the non-compound variants.
- `DynamicCommandRegistry` — the `watch` reconcile registers a new command,
  unregisters a removed one, and re-registers a changed one; `check` gating by
  `only_open_note` context and by unsupported `type`; anchor resolution for
  representative variants; `execute` invokes `OpenDateFlow` with the correct
  `journalNames` and `anchor`; the
  `journalRenamed` and `journalDeleted` subscriptions rewrite and remove
  `journal`-target commands.
- `JournalLifecycleService` — `rename` emits `journalRenamed` and `delete`
  emits `journalDeleted` (added to the existing `lifecycle.test.ts`).

Quality gates: `test`, `check:types`, `check:lint`.
