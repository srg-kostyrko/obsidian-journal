# v3 Command Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-level `CommandService` for registering Obsidian commands and ribbon icons, and port the first two built-in commands (`open-next`, `open-prev`).

**Architecture:** `CommandService` lives in `infrastructure/host/commands/`, mirroring the existing `suggests/` layout. It wraps Obsidian's `plugin.addCommand` / `removeCommand` / `addRibbonIcon`. Journal navigation commands live in `journals/navigation-commands.ts` as an eager service whose constructor registers `open-next` and `open-prev`, sourcing the active note from `WorkspaceService` and adjacent entries from `JournalsIndex`.

**Tech Stack:** TypeScript, Obsidian plugin API, the project's DI container, valibot-backed settings, vitest, paraglide i18n.

---

## Background

Read the design spec first: `docs/superpowers/specs/2026-05-21-v3-command-foundation-design.md`.

Reference code to mirror:

- `src/infrastructure/host/suggests/internal/suggest-service.ts` — host service that injects `InternalPluginToken`.
- `src/infrastructure/host/suggests/internal/suggest-service.test.ts` — host service test using `createFakeHost`.
- `src/infrastructure/host/internal/testing.ts` — the `createFakeHost` fake.
- `src/journals/vault-subscription.ts` — an eager journal service.
- `src/journals/flows/open-journal-entry.test.ts` — test wiring with a `Container` and fakes.

Obsidian API facts (from `node_modules/obsidian/obsidian.d.ts`):

- `Plugin.addCommand(command: Command): Command`
- `Plugin.removeCommand(commandId: string): void` — pass the same unprefixed id given to `addCommand`.
- `Plugin.addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => any): HTMLElement`
- `Command` has `id`, `name`, `icon?`, `callback?`, `checkCallback?`. `checkCallback` returns `boolean | void`.

## File Structure

- Create: `src/infrastructure/host/commands/types.ts` — `CommandRegistration` interface.
- Create: `src/infrastructure/host/commands/internal/command-service.ts` — `CommandService`.
- Create: `src/infrastructure/host/commands/internal/command-service.test.ts` — its tests.
- Create: `src/infrastructure/host/commands/index.ts` — barrel for the `commands/` folder.
- Modify: `src/infrastructure/host/internal/testing.ts` — add command/ribbon APIs to the fake plugin.
- Modify: `src/infrastructure/host/index.ts` — re-export `CommandService` and `CommandRegistration`.
- Modify: `src/infrastructure/host/module.ts` — register `CommandService`.
- Create: `src/journals/navigation-commands.ts` — `JournalNavigationCommands`.
- Create: `src/journals/navigation-commands.test.ts` — its tests.
- Modify: `src/journals/module.ts` — register `JournalNavigationCommands` eagerly.
- Modify: `messages/en.json` — two command-name messages.

---

## Task 1: Extend the fake host with command and ribbon APIs

The `createFakeHost` fake plugin has no `addCommand` / `removeCommand` / `addRibbonIcon`. Add them so `CommandService` can be tested. This is test infrastructure — it has no test of its own; Task 2 exercises it.

**Files:**

- Modify: `src/infrastructure/host/internal/testing.ts`

- [ ] **Step 1: Add the `Command` import**

In the top import from `obsidian`, add `Command` to the type-only imports. The line currently reads:

```ts
import { TFile, TFolder, type App, type CachedMetadata, type EventRef, type PaneType, type Plugin } from "obsidian";
```

Change it to:

```ts
import {
  TFile,
  TFolder,
  type App,
  type CachedMetadata,
  type Command,
  type EventRef,
  type PaneType,
  type Plugin,
} from "obsidian";
```

- [ ] **Step 2: Add the `FakeRibbonIcon` interface and extend `FakeHost`**

After the `FakeFileSystemEntry` interface, add:

```ts
export interface FakeRibbonIcon {
  readonly icon: string;
  readonly title: string;
  readonly callback: (evt: MouseEvent) => void;
  readonly element: HTMLElement;
}
```

In the `FakeHost` interface, add these two readonly members after `registeredEventReferences`:

```ts
  readonly commands: Map<string, Command>;
  readonly ribbonIcons: FakeRibbonIcon[];
```

- [ ] **Step 3: Declare the backing collections**

Inside `createFakeHost()`, next to `const registeredEventReferences: EventRef[] = [];`, add:

```ts
const commands = new Map<string, Command>();
const ribbonIcons: FakeRibbonIcon[] = [];
```

- [ ] **Step 4: Add the three methods to the fake plugin**

In the `const plugin = { ... }` object literal, add these methods after `register(callback)`:

```ts
    addCommand(command: Command): Command {
      commands.set(command.id, command);
      return command;
    },
    removeCommand(commandId: string): void {
      commands.delete(commandId);
    },
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
      const element = document.createElement("div");
      document.body.append(element);
      ribbonIcons.push({ icon, title, callback, element });
      return element;
    },
```

- [ ] **Step 5: Expose the collections on the returned object**

In the returned object literal (the one starting `return { app, plugin, files, ... }`), add after `registeredEventReferences,`:

```ts
    commands,
    ribbonIcons,
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run check:types`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/internal/testing.ts
git commit -m "test(host): add command and ribbon APIs to the fake host"
```

---

## Task 2: CommandService — register, check, and unregister

**Files:**

- Create: `src/infrastructure/host/commands/types.ts`
- Create: `src/infrastructure/host/commands/internal/command-service.ts`
- Test: `src/infrastructure/host/commands/internal/command-service.test.ts`

- [ ] **Step 1: Create the `CommandRegistration` type**

Create `src/infrastructure/host/commands/types.ts`:

```ts
export interface CommandRegistration {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly ribbon?: boolean;
  readonly check?: () => boolean;
  readonly execute: () => void | Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/infrastructure/host/commands/internal/command-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalPluginToken } from "../../internal/tokens";

import { CommandService } from "./command-service";

function build(): { service: CommandService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(CommandService).useClass(CommandService);
  return { service: c.resolve(CommandService), host };
}

describe("CommandService", () => {
  it("registers a command in the host", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", execute: () => {} });
    expect(host.commands.has("demo")).toBe(true);
  });

  it("runs execute when a command without a check is invoked", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      execute: () => {
        ran = true;
      },
    });
    host.commands.get("demo")?.callback?.();
    expect(ran).toBe(true);
  });

  it("reports availability through the check predicate", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", check: () => false, execute: () => {} });
    expect(host.commands.get("demo")?.checkCallback?.(true)).toBe(false);
  });

  it("skips execute when the check fails", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      check: () => false,
      execute: () => {
        ran = true;
      },
    });
    host.commands.get("demo")?.checkCallback?.(false);
    expect(ran).toBe(false);
  });

  it("runs execute when the check passes", () => {
    const { service, host } = build();
    let ran = false;
    service.register({
      id: "demo",
      name: "Demo",
      check: () => true,
      execute: () => {
        ran = true;
      },
    });
    const result = host.commands.get("demo")?.checkCallback?.(false);
    expect(ran).toBe(true);
    expect(result).toBe(true);
  });

  it("removes the command on unregister", () => {
    const { service, host } = build();
    service.register({ id: "demo", name: "Demo", execute: () => {} });
    service.unregister("demo");
    expect(host.commands.has("demo")).toBe(false);
  });

  it("ignores unregister for an unknown id", () => {
    const { service } = build();
    expect(() => service.unregister("missing")).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/infrastructure/host/commands/internal/command-service.test.ts`
Expected: FAIL — cannot find module `./command-service`.

- [ ] **Step 4: Implement `CommandService`**

Create `src/infrastructure/host/commands/internal/command-service.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { InternalPluginToken } from "../../internal/tokens";

import type { CommandRegistration } from "../types";

export class CommandService {
  readonly #plugin = inject(InternalPluginToken);
  readonly #logger = inject(LoggerFactoryToken).named("command-service");
  readonly #ribbons = new Map<string, HTMLElement>();

  register(registration: CommandRegistration): void {
    const run = (): void => {
      try {
        const result = registration.execute();
        if (result instanceof Promise) {
          result.catch((cause: unknown) => {
            this.#logger.error("command execute failed", { id: registration.id, cause });
          });
        }
      } catch (cause) {
        this.#logger.error("command execute failed", { id: registration.id, cause });
      }
    };

    const { check } = registration;
    if (check) {
      this.#plugin.addCommand({
        id: registration.id,
        name: registration.name,
        icon: registration.icon,
        checkCallback: (checking: boolean): boolean => {
          if (checking) return check();
          if (!check()) return false;
          run();
          return true;
        },
      });
    } else {
      this.#plugin.addCommand({
        id: registration.id,
        name: registration.name,
        icon: registration.icon,
        callback: run,
      });
    }

    if (registration.ribbon && registration.icon) {
      const element = this.#plugin.addRibbonIcon(registration.icon, registration.name, () => {
        if (check && !check()) return;
        run();
      });
      this.#ribbons.set(registration.id, element);
    }
  }

  unregister(id: string): void {
    this.#plugin.removeCommand(id);
    const ribbon = this.#ribbons.get(id);
    if (ribbon) {
      ribbon.remove();
      this.#ribbons.delete(id);
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/infrastructure/host/commands/internal/command-service.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/host/commands/types.ts src/infrastructure/host/commands/internal/command-service.ts src/infrastructure/host/commands/internal/command-service.test.ts
git commit -m "feat(host/commands): add CommandService with register/unregister"
```

---

## Task 3: CommandService — ribbon icons

Extend the same `command-service.test.ts` with ribbon coverage. The implementation already handles ribbons (Task 2 step 4); this task adds the tests that lock the behavior in.

**Files:**

- Test: `src/infrastructure/host/commands/internal/command-service.test.ts`

- [ ] **Step 1: Add the ribbon tests**

Inside the `describe("CommandService", ...)` block in `command-service.test.ts`, add these tests before the closing `});`:

```ts
it("adds a ribbon icon when ribbon is enabled", () => {
  const { service, host } = build();
  service.register({ id: "demo", name: "Demo", icon: "star", ribbon: true, execute: () => {} });
  expect(host.ribbonIcons).toHaveLength(1);
  expect(host.ribbonIcons[0]?.icon).toBe("star");
  expect(host.ribbonIcons[0]?.title).toBe("Demo");
});

it("does not add a ribbon icon when ribbon is disabled", () => {
  const { service, host } = build();
  service.register({ id: "demo", name: "Demo", icon: "star", ribbon: false, execute: () => {} });
  expect(host.ribbonIcons).toHaveLength(0);
});

it("runs execute when the ribbon icon is clicked", () => {
  const { service, host } = build();
  let ran = false;
  service.register({
    id: "demo",
    name: "Demo",
    icon: "star",
    ribbon: true,
    execute: () => {
      ran = true;
    },
  });
  host.ribbonIcons[0]?.callback(new MouseEvent("click"));
  expect(ran).toBe(true);
});

it("skips execute on ribbon click when the check fails", () => {
  const { service, host } = build();
  let ran = false;
  service.register({
    id: "demo",
    name: "Demo",
    icon: "star",
    ribbon: true,
    check: () => false,
    execute: () => {
      ran = true;
    },
  });
  host.ribbonIcons[0]?.callback(new MouseEvent("click"));
  expect(ran).toBe(false);
});

it("removes the ribbon element on unregister", () => {
  const { service, host } = build();
  service.register({ id: "demo", name: "Demo", icon: "star", ribbon: true, execute: () => {} });
  const element = host.ribbonIcons[0]?.element;
  service.unregister("demo");
  expect(element?.isConnected).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- src/infrastructure/host/commands/internal/command-service.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 3: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/infrastructure/host/commands/internal/command-service.test.ts
git commit -m "test(host/commands): cover ribbon icon registration and removal"
```

---

## Task 4: Export `CommandService` and register it in the host module

Wiring only — no test (the DI container and barrel exports are tooling-enforced).

**Files:**

- Create: `src/infrastructure/host/commands/index.ts`
- Modify: `src/infrastructure/host/index.ts`
- Modify: `src/infrastructure/host/module.ts`

- [ ] **Step 1: Create the `commands/` barrel**

Create `src/infrastructure/host/commands/index.ts`:

```ts
export { CommandService } from "./internal/command-service";
export type { CommandRegistration } from "./types";
```

- [ ] **Step 2: Re-export from the host barrel**

In `src/infrastructure/host/index.ts`, add this export. Place it just before the `export { defineModal, ... }` block:

```ts
export { CommandService, type CommandRegistration } from "./commands";
```

- [ ] **Step 3: Register `CommandService` in `createHostModule`**

In `src/infrastructure/host/module.ts`, add the import after the other internal imports:

```ts
import { CommandService } from "./commands/internal/command-service";
```

Then, inside `register(c)`, add this line after the `InputSuggestService` registration:

```ts
c.register(CommandService).useClass(CommandService);
```

- [ ] **Step 4: Verify it compiles and tests still pass**

Run: `npm run check:types && npm run check:lint && npm test -- src/infrastructure/host`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/host/commands/index.ts src/infrastructure/host/index.ts src/infrastructure/host/module.ts
git commit -m "feat(host): export and register CommandService"
```

---

## Task 5: Journal navigation commands (open-next / open-prev)

**Files:**

- Modify: `messages/en.json`
- Create: `src/journals/navigation-commands.ts`
- Test: `src/journals/navigation-commands.test.ts`

- [ ] **Step 1: Add the command-name messages**

In `messages/en.json`, add these two keys in alphabetical position (after `confirm_note_creation_title`, before `journal_*` keys — keys are sorted alphabetically):

```json
  "command_open_next": "Open next note",
  "command_open_previous": "Open previous note",
```

- [ ] **Step 2: Compile the i18n messages**

Run: `npm run compile:i18n`
Expected: PASS — regenerates `src/i18n/paraglide`. `m.command_open_next` and `m.command_open_previous` become available.

- [ ] **Step 3: Write the failing test**

Create `src/journals/navigation-commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";

import { JournalsIndex } from "./journals-index";
import { JournalNavigationCommands } from "./navigation-commands";

const FIRST = "daily/2026-05-01.md" as VaultPath;
const SECOND = "daily/2026-05-02.md" as VaultPath;
const ORPHAN = "notes/orphan.md" as VaultPath;

function build(): {
  host: ReturnType<typeof createFakeHost>;
  workspace: FakeWorkspaceService;
  index: JournalsIndex;
} {
  const host = createFakeHost();
  const workspace = new FakeWorkspaceService();
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(CommandService).useClass(CommandService);
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(JournalNavigationCommands).useClass(JournalNavigationCommands);

  const index = c.resolve(JournalsIndex);
  index.register({ journalName: "daily", anchor: anchor("2026-05-01"), path: FIRST });
  index.register({ journalName: "daily", anchor: anchor("2026-05-02"), path: SECOND });

  c.resolve(JournalNavigationCommands);
  return { host, workspace, index };
}

describe("JournalNavigationCommands", () => {
  it("makes open-next available when a following entry exists", () => {
    const { host, workspace } = build();
    workspace.setActive(FIRST);
    expect(host.commands.get("open-next")?.checkCallback?.(true)).toBe(true);
  });

  it("makes open-next unavailable when no following entry exists", () => {
    const { host, workspace } = build();
    workspace.setActive(SECOND);
    expect(host.commands.get("open-next")?.checkCallback?.(true)).toBe(false);
  });

  it("makes open-next unavailable when the active note is not a journal note", () => {
    const { host, workspace } = build();
    workspace.setActive(ORPHAN);
    expect(host.commands.get("open-next")?.checkCallback?.(true)).toBe(false);
  });

  it("opens the following entry when open-next runs", () => {
    const { host, workspace } = build();
    workspace.setActive(FIRST);
    host.commands.get("open-next")?.checkCallback?.(false);
    expect(workspace.isOpen(SECOND)).toBe(true);
  });

  it("opens the preceding entry when open-prev runs", () => {
    const { host, workspace } = build();
    workspace.setActive(SECOND);
    host.commands.get("open-prev")?.checkCallback?.(false);
    expect(workspace.isOpen(FIRST)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- src/journals/navigation-commands.test.ts`
Expected: FAIL — cannot find module `./navigation-commands`.

- [ ] **Step 5: Implement `JournalNavigationCommands`**

Create `src/journals/navigation-commands.ts`:

```ts
import { inject } from "@/infrastructure/di";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import type { Option } from "@/infrastructure/result";
import { m } from "@/i18n";

import { JournalsIndex } from "./journals-index";

type Direction = "next" | "previous";

export class JournalNavigationCommands {
  readonly #commands = inject(CommandService);
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);
  readonly #logger = inject(LoggerFactoryToken).named("journal-navigation");

  constructor() {
    this.#commands.register({
      id: "open-next",
      name: m.command_open_next(),
      check: () => this.#resolve("next").isSome(),
      execute: () => this.#open("next"),
    });
    this.#commands.register({
      id: "open-prev",
      name: m.command_open_previous(),
      check: () => this.#resolve("previous").isSome(),
      execute: () => this.#open("previous"),
    });
  }

  #resolve(direction: Direction): Option<VaultPath> {
    return this.#workspace
      .activeNote()
      .flatMap((path) =>
        this.#index
          .entryByPath(path)
          .flatMap((entry) =>
            direction === "next"
              ? this.#index.findNext(entry.journalName, entry.anchor)
              : this.#index.findPrevious(entry.journalName, entry.anchor),
          ),
      );
  }

  #open(direction: Direction): void {
    this.#resolve(direction).match({
      some: (path) => {
        this.#workspace.openNote(path).tapErr((error) => {
          this.#logger.error("failed to open journal note", { path, error });
        });
      },
      none: () => {},
    });
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/journals/navigation-commands.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Run the quality gates**

Run: `npm run check:types && npm run check:lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add messages/en.json src/i18n/paraglide src/journals/navigation-commands.ts src/journals/navigation-commands.test.ts
git commit -m "feat(journals): add open-next and open-prev navigation commands"
```

---

## Task 6: Register `JournalNavigationCommands` eagerly in the journals module

Wiring only — no test. Eager registration means `container.autoLoad()` constructs the service at boot, and its constructor registers the two commands.

**Files:**

- Modify: `src/journals/module.ts`

- [ ] **Step 1: Import the service**

In `src/journals/module.ts`, add this import after the `JournalsIndex` import:

```ts
import { JournalNavigationCommands } from "./navigation-commands";
```

- [ ] **Step 2: Register it eagerly**

Inside `journalsModule.register(c)`, add this line after the `VaultSubscriptionService` registration:

```ts
c.register(JournalNavigationCommands).useClass(JournalNavigationCommands).eager();
```

- [ ] **Step 3: Verify it compiles and the whole suite passes**

Run: `npm run check:types && npm run check:lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/journals/module.ts
git commit -m "feat(journals): register navigation commands at startup"
```

---

## Self-Review Notes

- **Spec coverage:** `CommandService` register/unregister/ribbon — Tasks 2–4. `open-next`/`open-prev` with check + execute — Task 5. Eager registration via `journals/module.ts` — Task 6. Fake host support — Task 1.
- **Out of scope (per spec), absent from this plan:** ribbon usage by built-ins, the user-configurable command collection, `connect-note`/`open-calendar`/`change-shelf`, Notice feedback. The ribbon _capability_ is built and tested in Tasks 2–3 because it is part of the foundation; no built-in command sets `ribbon`.
- **Error logging** (`command execute failed`, `failed to open journal note`) is defensive and deliberately untested — asserting log shape is discouraged in this codebase.
- **Command ids** `open-next` / `open-prev` match v2 exactly, so user hotkey bindings survive.
