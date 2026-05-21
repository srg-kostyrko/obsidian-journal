# v3 Command Foundation — Design

## Goal

Establish the foundation for porting v2 commands into v3: a host-level command
service, plus the first two built-in commands (`open-next`, `open-prev`).

v3 currently has no command abstraction. The host layer exposes Notes,
Workspace, Modal, and Suggest services but nothing for registering Obsidian
commands or ribbon icons. Every command port is blocked on this gap.

## Scope

In scope:

- `CommandService` in `infrastructure/host` — register/unregister Obsidian
  commands and their optional ribbon icons.
- Two built-in journal navigation commands: `open-next`, `open-prev`.

Out of scope (later specs):

- The unified user-configurable command collection and its `target` descriptor
  (`all` / `journal` / future `shelf`). This replaces v2's three separate
  stores — `PluginCommand[]` at global level, `PluginCommand[]` per shelf, and
  `JournalCommand[]` per journal — with one settings collection whose items
  carry a descriptor for where each command applies.
- The built-ins `connect-note`, `open-calendar`, `change-calendar-shelf` —
  each depends on a v3 feature that does not exist yet (a ConnectNote flow, a
  calendar sidebar view, shelves).
- Notice-based feedback.

## Background: v2 command model

- Built-in commands (`open-next`, `open-prev`, `connect-note`, `open-calendar`,
  `change-calendar-shelf`) are hardcoded in `main.ts`.
- User-configurable commands live in three places: global (`config.commands`),
  per shelf (`shelf.commands`), and per journal (`journal.commands`). The first
  two share the `PluginCommand` shape; per-journal commands use `JournalCommand`
  with a wider `type` set and a `context` field.
- v2's `open-next`/`open-prev` use Obsidian's `editorCallback`. A bug report
  showed this does not fire for a note opened in preview mode. v3 uses a plain
  callback with an availability check instead, sourcing the active note from
  `WorkspaceService`.

## Component 1 — `CommandService`

Location: `infrastructure/host/commands/`, mirroring the `suggests/` layout
(`index.ts`, `types.ts`, `internal/command-service.ts`).

```ts
interface CommandRegistration {
  id: string; // e.g. "open-next"; Obsidian prefixes with the plugin id
  name: string;
  icon?: string;
  ribbon?: boolean; // also add a ribbon icon (requires icon); tooltip = name
  check?: () => boolean; // availability predicate
  execute: () => void | Promise<void>;
}

class CommandService {
  register(registration: CommandRegistration): void;
  unregister(id: string): void;
}
```

Behaviour:

- Injects `InternalPluginToken`.
- `register` maps to `plugin.addCommand`. When `check` is present it uses
  `checkCallback`: `checking ? check() : check() && (execute(), true)`.
  Otherwise it uses a plain `callback`.
- Obsidian's `editorCallback` is deliberately not used — it does not fire for
  preview-mode notes. Commands resolve the active note via `WorkspaceService`.
- When `ribbon` is true, `register` also calls `plugin.addRibbonIcon` with the
  registration's `icon` and `name` (as tooltip). The ribbon click runs
  `execute()` gated by `check?.() ?? true` — the same gating as the command.
- The service keeps an internal `Map<string, HTMLElement>` of ribbon elements
  keyed by command id.
- `unregister` calls `plugin.removeCommand(id)` and, if a ribbon element was
  tracked for that id, removes it (`element.remove()`) and drops the map entry.
  `unregister` on an unknown id is a no-op.
- Async `execute` rejections are caught and logged via `Logger`.
- No `Disposer` is involved. A command has a stable identity (`id`), so an
  id-keyed `unregister` is the natural handle — settings-driven callers (spec 2)
  already hold the id and need no disposer bookkeeping. The host's `Disposer`
  type stays scoped to `input-suggests`.

Registered non-eager in `createHostModule`; consumers inject it.

## Component 2 — Journal navigation commands

Location: `journals/navigation-commands.ts`.

An eager `JournalNavigationCommands` service. Its constructor injects
`CommandService`, `WorkspaceService`, and `JournalsIndex`, and registers two
commands, keeping the v2 ids:

- `open-next` — "Open next journal note"
- `open-prev` — "Open previous journal note"

Neither sets `ribbon` (v2 fidelity — these had no ribbon icon).

For each command:

- `check`: `WorkspaceService.activeNote()` is `Some` → `JournalsIndex.entryByPath`
  on that path is `Some` → `JournalsIndex.findNext` / `findPrevious` for the
  entry's journal and anchor is `Some`.
- `execute`: the same resolution chain, then `WorkspaceService.openNote(path)`.

`findNext` / `findPrevious` navigate among existing journal notes only, matching
v2's built-in behaviour (it only opened a note that already existed).

Registered eager via the autoLoad step referenced from `journals/module.ts`.
The built-ins live for the plugin lifetime; Obsidian removes their commands on
unload, so `JournalNavigationCommands` never calls `unregister`.

## Testing

- `CommandService`: against the host test fakes — `register` adds a command;
  `unregister` removes it; `check` gates `execute`; the `ribbon` path adds and
  removes a ribbon icon. The ribbon path is covered even though no built-in uses
  it yet — that exercises the foundation component, not module wiring.
- `JournalNavigationCommands`: the `check` predicate and `execute` behaviour
  with a fake `WorkspaceService` and a populated `JournalsIndex` — covering an
  active journal note with and without an adjacent entry, and a non-journal
  active note.

Quality gates: `test`, `check:types`, `check:lint`.
