# v3 Host — Design

**Stage:** Host module for the v3 plugin rewrite — the single boundary between feature code and Obsidian
**Date:** 2026-05-13
**Status:** Draft for review

## Purpose

v2 sprinkled direct Obsidian API calls throughout the codebase. The vault and
workspace were touched from Vue components (`useApp()`), code blocks, view
classes, settings tabs, and assorted utilities. Two partial facades existed
(`ObsidianManager`, `ObsidianNotesManager`) but most of the surface area
bypassed them. The `Plugin` instance leaked everywhere through a
plugin-typed singleton interface.

v3 has so far carried that leak forward in a smaller form: the public DI
tokens `PluginToken` and `ObsidianAppToken` (in
`src/infrastructure/obsidian-tokens.ts`) are injectable from any module.

This stage closes the boundary. All direct work with Obsidian — vault file
I/O, workspace open/find, plugin-data persistence, event subscriptions —
goes through one module at `src/infrastructure/host/`. The module returns
plugin-domain types (no `TFile`, `WorkspaceLeaf`, `MarkdownView`, `App`, or
`Plugin` cross the boundary). Other v3 features inject narrow service
tokens; the raw `App`/`Plugin` references are bound to host-internal tokens
that are not part of the host's public barrel.

The stage's deliverables are the host module folder, three services
(`NotesService`, `WorkspaceService`, `PluginData`), the domain types they
share (`VaultPath`, `Note`, `OpenMode`), the error hierarchy, fakes for
tests, a module factory `createHostModule(plugin)`, and wiring in `main.ts`.

## Non-goals

- No commands, ribbons, menus, modals, views, code-block processors,
  markdown post-processors, settings tab, editor, or templater interop. Each
  is a follow-up spec under the same module conventions.
- No rich metadata projection. `CachedMetadata`'s headings/links/tags/embeds
  are deferred; foundations expose only `metadata-changed` events and
  `updateFrontmatter`.
- No schema / validation on `PluginData`. Each feature module owns its
  persisted-data schema (likely zod) and feeds opaque JSON through the host.
- No refactor of calendar's existing `import { moment } from "obsidian"`.
  Date/time abstraction lives in the calendar module; not part of host.
- No ESLint `no-restricted-imports` rule blocking `obsidian` outside
  `host/**`. The boundary is enforced by what the host module exports — the
  raw `App`/`Plugin` tokens are unreachable. A lint rule can be added later
  if drift becomes a problem.
- No "escape hatch" token. The boundary is total.

## Architecture

### Layout

```
src/infrastructure/host/
├── index.ts                  # public barrel
├── module.ts                 # createHostModule(plugin): Module
├── types.ts                  # VaultPath, Note, OpenMode, event payloads, Subscribable
├── errors.ts                 # HostError hierarchy
├── testing.ts                # FakeNotesService, FakeWorkspaceService, FakePluginData
└── internal/
    ├── tokens.ts             # InternalPluginToken, InternalObsidianAppToken (not exported)
    ├── notes-service.ts      # NotesService impl
    ├── workspace-service.ts  # WorkspaceService impl
    ├── plugin-data.ts        # PluginData impl
    └── obsidian-bridge.ts    # TFile → Note, PaneType ↔ OpenMode, internal helpers
```

Tests are colocated (`notes-service.test.ts`, `workspace-service.test.ts`,
`plugin-data.test.ts`, `errors.test.ts`). No `index.test.ts`, no
`module.test.ts`, no `types.test.ts` (per the "no wiring tests" rule).

### The boundary

`src/infrastructure/obsidian-tokens.ts` is **deleted**. The two tokens it
defined (`PluginToken`, `ObsidianAppToken`) are replaced by
`InternalPluginToken` and `InternalObsidianAppToken` inside
`host/internal/tokens.ts`. Those internal tokens are imported only by
files under `host/internal/`. They are not re-exported from `host/index.ts`,
so feature code has no symbol it can pass to `inject(...)` to reach `App`
or `Plugin`.

`main.ts` no longer touches the raw tokens at all. The module factory
captures the plugin instance in its closure and binds it to internal tokens
inside `register()`:

```ts
// src/infrastructure/host/module.ts
import type { Plugin } from "obsidian";
import type { Module } from "@/infrastructure/di";

import { InternalObsidianAppToken, InternalPluginToken } from "./internal/tokens";
import { NotesService } from "./internal/notes-service";
import { WorkspaceService } from "./internal/workspace-service";
import { PluginData } from "./internal/plugin-data";

export function createHostModule(plugin: Plugin): Module {
  return {
    register(c) {
      c.register(InternalPluginToken).useValue(plugin);
      c.register(InternalObsidianAppToken).useValue(plugin.app);
      c.register(NotesService).useClass(NotesService);
      c.register(WorkspaceService).useClass(WorkspaceService);
      c.register(PluginData).useClass(PluginData);
    },
  };
}
```

```ts
// src/main.ts
container.addModule(LoggerModule);
container.addModule(FlowsModule);
container.addModule(createHostModule(this));
container.addModule(CalendarModule);
await container.autoLoad();
```

Service classes inject the internal tokens directly via field initializers:

```ts
// src/infrastructure/host/internal/notes-service.ts
export class NotesService {
  readonly #app = inject(InternalObsidianAppToken);
  readonly #plugin = inject(InternalPluginToken);
  // ...
}
```

Each service self-binds as its own token (the v3 convention established by
the flows design — `TokenLike<T> = Token<T> | Class<T>`, class identity is
the token).

## Domain types

### `VaultPath`

```ts
export type VaultPath = string & { readonly __brand: "VaultPath" };
```

A branded string. Feature code cannot construct one from a plain string;
the host is the only place that produces `VaultPath` values. Helpers that
need to accept user-typed strings call into the host (e.g., a future
`notes.normalize(raw): Result<VaultPath, InvalidPathError>` if needed —
not included in foundations).

`VaultPath` covers both note paths and folder paths. Obsidian represents
both as the same string shape; introducing a separate `FolderPath` brand
buys nothing here because the host always knows which kind it returned.

### `Note`

```ts
export interface Note {
  readonly path: VaultPath;
  readonly basename: string; // filename without ".md"
  readonly folder: VaultPath; // parent folder path
}
```

A snapshot. Mutations on the underlying file do not update the record;
callers re-fetch via `notes.find(path)` when they need fresh state.

### `OpenMode`

```ts
export type OpenMode = "active" | "tab" | "split" | "window";
```

The literal-string values match Obsidian's `PaneType`, but we declare our
own type so `import { type PaneType } from "obsidian"` never appears in
feature code. The bridge translates: `"active"` → `false`/active leaf,
`"tab"` | `"split"` | `"window"` → the matching `PaneType`.

### `Subscribable<E>`

```ts
import type { Emitter } from "nanoevents";

export type Subscribable<E> = Pick<Emitter<E>, "on">;
```

The subscribable surface — just `.on(event, cb): () => void`. Services
hold a real `Emitter<E>` internally but expose only `Subscribable<E>` so
consumers cannot call `.emit(...)`. The unbind function returned by `.on`
is the disposer.

## Services

### `NotesService`

```ts
export interface NotesEvents {
  created: (note: Note) => void;
  renamed: (e: { from: VaultPath; to: VaultPath }) => void;
  deleted: (path: VaultPath) => void;
  "metadata-changed": (path: VaultPath) => void;
}

export class NotesService {
  // queries
  find(path: VaultPath): Option<Note>;
  listInFolder(folder: VaultPath): AsyncResult<VaultPath[], FolderNotFoundError>;
  allMarkdownNotes(): VaultPath[];

  // commands
  create(path: VaultPath, content: string): AsyncResult<Note, NoteAlreadyExistsError | NoteCreateError>;
  read(path: VaultPath): AsyncResult<string, NoteNotFoundError | NoteReadError>;
  write(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError>;
  append(path: VaultPath, content: string): AsyncResult<void, NoteNotFoundError | NoteWriteError>;
  rename(
    path: VaultPath,
    newPath: VaultPath,
  ): AsyncResult<Note, NoteNotFoundError | NoteAlreadyExistsError | NoteRenameError>;
  delete(path: VaultPath): AsyncResult<void, NoteNotFoundError | NoteDeleteError>;
  updateFrontmatter(
    path: VaultPath,
    mutate: (fm: Record<string, unknown>) => void,
  ): AsyncResult<void, NoteNotFoundError | FrontmatterError>;

  // subscriptions
  readonly events: Subscribable<NotesEvents>;
}
```

Implementation notes (internal, not part of the API surface):

- The service constructs `nanoevents.createNanoEvents<NotesEvents>()` once;
  `events` is typed as `Subscribable<NotesEvents>` but the underlying value
  is the full emitter (the service uses `emit` internally).
- The service registers obsidian listeners on `vault.on("create" | "rename"
| "delete")` and `metadataCache.on("changed")` via
  `plugin.registerEvent(...)` so plugin unload tears them down. Each
  underlying handler translates the `TFile`/`TAbstractFile` payload into the
  domain event and forwards it through the nanoevents emitter.
- `create` ensures the parent folder exists (mirrors v2 behavior), reading
  the parent from the path string. Failure to create the folder surfaces as
  `NoteCreateError`.
- Frontmatter updates use `app.fileManager.processFrontMatter` internally.

### `WorkspaceService`

```ts
export interface WorkspaceEvents {
  "active-note-changed": (path: Option<VaultPath>) => void;
}

export class WorkspaceService {
  activeNote(): Option<VaultPath>;
  isOpen(path: VaultPath): boolean;
  openNote(path: VaultPath, mode?: OpenMode): AsyncResult<void, WorkspaceOpenError>;

  readonly events: Subscribable<WorkspaceEvents>;
}
```

Implementation notes:

- `openNote` follows v2 semantics: if a leaf already shows the file, focus
  it; otherwise open via `workspace.getLeaf(mode)`. Default mode is
  `"active"`.
- `active-note-changed` bridges `workspace.on("active-leaf-change")` and
  filters to markdown leaves; payload is `Option<VaultPath>` because there
  is no active note when a non-markdown view is focused.

### `PluginData`

```ts
export class PluginData {
  load(): AsyncResult<unknown, PluginDataIOError>;
  save(data: unknown): AsyncResult<void, PluginDataIOError>;
}
```

A thin wrapper around `plugin.loadData()` / `plugin.saveData(...)`. The
host treats the payload as opaque JSON. Each feature module that owns
persisted state defines its own schema (zod or similar) and validates the
result after calling `load`.

## Error model

All errors live in `host/errors.ts` and extend a single `HostError` base.

```ts
export abstract class HostError extends Error {
  abstract readonly kind: string;
}

export class NoteNotFoundError extends HostError {
  readonly kind = "note-not-found";
  constructor(readonly path: VaultPath) {
    super(`Note not found: ${path}`);
  }
}

export class NoteAlreadyExistsError extends HostError {
  readonly kind = "note-already-exists";
  constructor(readonly path: VaultPath) {
    super(`Note already exists: ${path}`);
  }
}

export class NoteReadError extends HostError {
  readonly kind = "note-read-failed";
  constructor(
    readonly path: VaultPath,
    readonly cause: unknown,
  ) {
    super(`Read failed: ${path}`);
  }
}

// NoteWriteError, NoteCreateError, NoteRenameError, NoteDeleteError,
// FrontmatterError, FolderNotFoundError, WorkspaceOpenError, PluginDataIOError
// follow the same pattern.
```

`kind` lets callers branch with `ts-pattern` (`match(err).with({ kind:
"note-not-found" }, ...)`), per the established v3 convention. The cause
field carries the underlying obsidian/IO error for diagnostics; the host
never lets a raw obsidian exception escape.

## Testing

`host/testing.ts` exports a fake per service:

```ts
export class FakeNotesService implements NotesService {
  readonly #files = new Map<VaultPath, string>();
  readonly #emitter = createNanoEvents<NotesEvents>();
  readonly events: Subscribable<NotesEvents> = this.#emitter;

  find(path: VaultPath): Option<Note> { /* derive from #files */ }
  read(path: VaultPath): AsyncResult<string, NoteReadError> { /* ... */ }
  // ... etc
  // No simulateReadError / simulateWriteError queue. Tests that need
  // failures use vi.spyOn(fake, "read").mockReturnValueOnce(err(...))
}

export class FakeWorkspaceService implements WorkspaceService { ... }
export class FakePluginData implements PluginData { ... }
```

Fakes use real nanoevents emitters so subscription/emit semantics are
exercised without obsidian. They live in `testing.ts` (the test-only barrel)
so the main barrel does not pull them into the bundle.

Tests in this module exercise the _real_ services against a minimal
obsidian mock in `__mocks__/obsidian.ts` (already present in the project).
Feature-module tests import the fakes from `@/infrastructure/host/testing`
and inject them via DI overrides.

Per the "no tests for mocks/fakes" rule, fakes themselves are not
unit-tested.

## Public barrel

`host/index.ts` re-exports exactly:

- service classes as tokens: `NotesService`, `WorkspaceService`, `PluginData`
- domain types: `VaultPath`, `Note`, `OpenMode`, `Subscribable`,
  `NotesEvents`, `WorkspaceEvents`
- errors: `HostError` and every concrete subclass
- the module factory: `createHostModule`

It does **not** re-export `InternalPluginToken`, `InternalObsidianAppToken`,
or anything from `internal/`. It does not re-export `testing.ts`.

## Dependencies

Adds `nanoevents` to runtime dependencies. ~200 bytes, no transitive deps,
tiny and stable. The `Emitter<E>` typed interface is the load-bearing
piece; this is what lets `Subscribable<E>` work without any custom
type-level machinery.

## Migration impact

- `src/infrastructure/obsidian-tokens.ts` → deleted
- `src/main.ts` → uses `createHostModule(this)` in place of the two
  `useValue` registrations
- `src/calendar/testing.ts` and any other current consumer of
  `PluginToken` / `ObsidianAppToken` → update to inject the corresponding
  host service, or (for tests that build minimal containers) bind the
  internal tokens directly via host's testing barrel

The current set of v3 modules (logger, flows, calendar, di) does not
otherwise touch obsidian, so the migration footprint is small. A grep for
`PluginToken|ObsidianAppToken` outside `host/` after the change should
return zero hits.

## Open follow-ups

These each warrant their own spec when the feature needs them:

- `CommandRegistry` — replaces v2 `ObsidianManager.addCommand` /
  `removeCommand`
- `RibbonRegistry` — replaces v2 `ObsidianManager.addRibbonIcon`
- `MenuService` — file-menu / context-menu integration
- `ModalService` — Vue-modal wrapper (depends on the host module for
  `Plugin` access)
- `ViewRegistry` — `registerView` / `revealView`, with the imperative
  helper + disposer pattern called out in user memory
- `CodeBlockRegistry` — `registerMarkdownCodeBlockProcessor`
- `MarkdownPostProcessorRegistry`
- `SettingsTab` host integration
- `EditorService` — cursor / editor operations (templater cursor jump)
- `TemplaterBridge` — `tryApplyingTemplater`, separate from the editor
  service because the abstraction is distinct
- `NoteMetadata` — projection of `CachedMetadata` into domain types
  (frontmatter, headings, links, tags), driving `notes.metadata(path)`
- Calendar's `moment` import → optional pass through the host, or move
  date abstraction entirely into the calendar module
