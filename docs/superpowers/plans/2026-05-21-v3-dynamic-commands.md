# v3 Dynamic Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v2's three separate user-command stores with one settings collection whose items register live as Obsidian commands.

**Architecture:** A new top-level `src/commands/` feature. A `defineCollection` holds `CommandConfig` items. `DynamicCommandRegistry` watches that collection and reconciles Obsidian command registrations through the existing `CommandService`, resolving target dates via `CycleService` and delegating opening to `OpenDateFlow`. `JournalLifecycleService` emits rename/delete domain events that the registry consumes to cascade `journal`-target commands.

**Tech Stack:** TypeScript, valibot (settings schemas), Vue reactivity (`watch`), `ts-pattern`, nanoevents, vitest.

**Spec:** `docs/superpowers/specs/2026-05-21-v3-dynamic-commands-design.md`

---

## Conventions

- Tests are colocated `*.test.ts` files next to the implementation.
- Per-task quality gates, run at the end of every task:
  - `npx vitest run <changed test files>` — must pass.
  - `npm run check:types` — must pass.
  - `npm run check:lint` — must pass.
- This project has no e2e suite; `npm run test` (vitest) is the full gate.
- Commit after each task. The pre-commit hook runs prettier; import ordering is auto-fixed, so if `check:lint` flags import order, run `npm run check:lint -- --fix` (or let the commit hook format) and re-stage.

---

## Task 1: Command collection schema

Creates the settings collection and its types. No behavior yet — just the data shape.

**Files:**

- Create: `src/commands/config.ts`
- Test: `src/commands/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/commands/config.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { commandCollection } from "./config";

describe("commandCollection", () => {
  it("produces a schema-valid config from defaultItem", () => {
    const item = commandCollection.defaultItem("cmd-1");
    const parsed = v.safeParse(commandCollection.itemSchema, item);
    expect(parsed.success).toBe(true);
  });

  it("rejects an all-target command whose write type is custom", () => {
    const command = {
      name: "Cmd",
      icon: "",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "all", writeType: "custom" },
      type: "same",
      context: "today",
    };
    const parsed = v.safeParse(commandCollection.itemSchema, command);
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/commands/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Write the implementation**

Create `src/commands/config.ts`:

```ts
import * as v from "valibot";

import { defineCollection } from "@/settings";

const commandTargetSchema = v.union([
  v.object({
    kind: v.literal("all"),
    writeType: v.picklist(["day", "week", "month", "quarter", "year"]),
  }),
  v.object({
    kind: v.literal("journal"),
    journalName: v.pipe(v.string(), v.minLength(1)),
  }),
]);

const commandTypeSchema = v.picklist([
  "same",
  "next",
  "previous",
  "same_next_week",
  "same_previous_week",
  "same_next_month",
  "same_previous_month",
  "same_next_year",
  "same_previous_year",
]);

const commandContextSchema = v.picklist(["today", "open_note", "only_open_note"]);

const openModeSchema = v.picklist(["active", "tab", "split", "window"]);

const commandConfigSchema = v.object({
  name: v.string(),
  icon: v.string(),
  showInRibbon: v.boolean(),
  openMode: openModeSchema,
  target: commandTargetSchema,
  type: commandTypeSchema,
  context: commandContextSchema,
});

export type CommandTarget = v.InferOutput<typeof commandTargetSchema>;
export type CommandType = v.InferOutput<typeof commandTypeSchema>;
export type CommandContext = v.InferOutput<typeof commandContextSchema>;
export type CommandConfig = v.InferOutput<typeof commandConfigSchema>;

export const commandCollection = defineCollection("commands", commandConfigSchema, () => ({
  name: "",
  icon: "",
  showInRibbon: false,
  openMode: "active",
  target: { kind: "all", writeType: "day" },
  type: "same",
  context: "today",
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/commands/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run quality gates and commit**

```bash
npm run check:types
npm run check:lint
git add src/commands/config.ts src/commands/config.test.ts
git commit -m "feat(commands): add the dynamic command collection schema"
```

---

## Task 2: Resolution helpers

Pure functions: which command types a write type supports, and the calendar shift for compound types.

**Files:**

- Create: `src/commands/resolve.ts`
- Test: `src/commands/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/commands/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { compoundShift, supportedTypes } from "./resolve";

describe("supportedTypes", () => {
  it("offers all nine variants for day journals", () => {
    expect(supportedTypes("day")).toHaveLength(9);
  });

  it("offers only same/next/previous for week journals", () => {
    expect(supportedTypes("week")).toEqual(["same", "next", "previous"]);
  });

  it("offers only same/next/previous for custom journals", () => {
    expect(supportedTypes("custom")).toEqual(["same", "next", "previous"]);
  });

  it("adds the same-year variants for month journals", () => {
    expect(supportedTypes("month")).toEqual(["same", "next", "previous", "same_next_year", "same_previous_year"]);
  });
});

describe("compoundShift", () => {
  it("maps same_next_week to a one-week forward shift", () => {
    expect(compoundShift("same_next_week")).toEqual({ amount: 1, unit: "w" });
  });

  it("maps same_previous_year to a one-year backward shift", () => {
    expect(compoundShift("same_previous_year")).toEqual({ amount: -1, unit: "y" });
  });

  it("returns null for the non-compound next variant", () => {
    expect(compoundShift("next")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/commands/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`.

- [ ] **Step 3: Write the implementation**

Create `src/commands/resolve.ts`:

```ts
import { match } from "ts-pattern";

import type { JournalWrite } from "@/journals";

import type { CommandType } from "./config";

export interface CompoundShift {
  readonly amount: number;
  readonly unit: "w" | "m" | "y";
}

export function supportedTypes(writeType: JournalWrite["type"]): CommandType[] {
  return match<JournalWrite["type"], CommandType[]>(writeType)
    .with("day", () => [
      "same",
      "next",
      "previous",
      "same_next_week",
      "same_previous_week",
      "same_next_month",
      "same_previous_month",
      "same_next_year",
      "same_previous_year",
    ])
    .with("month", "quarter", () => ["same", "next", "previous", "same_next_year", "same_previous_year"])
    .with("week", "year", "custom", () => ["same", "next", "previous"])
    .exhaustive();
}

export function compoundShift(type: CommandType): CompoundShift | null {
  return match<CommandType, CompoundShift | null>(type)
    .with("same_next_week", () => ({ amount: 1, unit: "w" }))
    .with("same_previous_week", () => ({ amount: -1, unit: "w" }))
    .with("same_next_month", () => ({ amount: 1, unit: "m" }))
    .with("same_previous_month", () => ({ amount: -1, unit: "m" }))
    .with("same_next_year", () => ({ amount: 1, unit: "y" }))
    .with("same_previous_year", () => ({ amount: -1, unit: "y" }))
    .otherwise(() => null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/commands/resolve.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run quality gates and commit**

```bash
npm run check:types
npm run check:lint
git add src/commands/resolve.ts src/commands/resolve.test.ts
git commit -m "feat(commands): add command type and offset resolution helpers"
```

---

## Task 3: Journal lifecycle domain events

`JournalLifecycleService` gains a nanoevents emitter and emits `journalRenamed`/`journalDeleted`. This is what lets the registry cascade journal renames (Task 5) — a watcher alone cannot tell a rename from a delete.

**Files:**

- Modify: `src/journals/settings/lifecycle.ts`
- Test: `src/journals/settings/lifecycle.test.ts` (append a new `describe` block)

- [ ] **Step 1: Write the failing test**

Append to `src/journals/settings/lifecycle.test.ts` (the `buildInitialized` helper already exists at the top of the file):

```ts
describe("JournalLifecycleService events", () => {
  it("emits journalRenamed after a successful rename", async () => {
    const { service } = await buildInitialized();
    service.create("daily", { type: "day" });
    const events: { oldName: string; newName: string }[] = [];
    service.events.on("journalRenamed", (payload) => events.push(payload));
    service.rename("daily", "morning");
    expect(events).toEqual([{ oldName: "daily", newName: "morning" }]);
  });

  it("does not emit journalRenamed when the rename fails", async () => {
    const { service } = await buildInitialized();
    service.create("daily", { type: "day" });
    const events: unknown[] = [];
    service.events.on("journalRenamed", (payload) => events.push(payload));
    service.rename("daily", "");
    expect(events).toEqual([]);
  });

  it("emits journalDeleted after a successful delete", async () => {
    const { service } = await buildInitialized();
    service.create("daily", { type: "day" });
    const events: { journalName: string }[] = [];
    service.events.on("journalDeleted", (payload) => events.push(payload));
    service.delete("daily");
    expect(events).toEqual([{ journalName: "daily" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/journals/settings/lifecycle.test.ts`
Expected: FAIL — `service.events` is undefined.

- [ ] **Step 3: Write the implementation**

In `src/journals/settings/lifecycle.ts`:

Add these imports to the existing import block:

```ts
import { createNanoEvents } from "nanoevents";

import type { Subscribable, TypedEmitter } from "@/infrastructure/events";
```

Add this exported interface above the `JournalLifecycleService` class:

```ts
export interface JournalLifecycleEvents {
  journalRenamed: (payload: { oldName: string; newName: string }) => void;
  journalDeleted: (payload: { journalName: string }) => void;
}
```

Add the emitter fields directly after the existing `#settings` field:

```ts
  readonly #emitter: TypedEmitter<JournalLifecycleEvents> = createNanoEvents();
  readonly events: Subscribable<JournalLifecycleEvents> = this.#emitter;
```

In `rename`, emit immediately after the existing `collection.remove(oldName);` line, still inside the generator:

```ts
collection.remove(oldName);
this.#emitter.emit("journalRenamed", { oldName, newName });
```

In `delete`, emit immediately after the existing `collection.remove(name);` line:

```ts
collection.remove(name);
this.#emitter.emit("journalDeleted", { journalName: name });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/journals/settings/lifecycle.test.ts`
Expected: PASS (all existing tests plus the 3 new ones).

- [ ] **Step 5: Run quality gates and commit**

```bash
npm run check:types
npm run check:lint
git add src/journals/settings/lifecycle.ts src/journals/settings/lifecycle.test.ts
git commit -m "feat(journals/settings): emit journal rename and delete events"
```

---

## Task 4: DynamicCommandRegistry — core

The registry: an `initialize()` that reconciles Obsidian command registrations against the collection, `check` gating, and `execute` delegating to `OpenDateFlow`. The journal-lifecycle cascade is added in Task 5.

`initialize()` is explicit (not constructor work) because `SettingsService.getCollection` throws before settings are loaded, and eager services are constructed by `container.autoLoad()` before that.

**Files:**

- Create: `src/commands/command-registry.ts`
- Test: `src/commands/command-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/commands/command-registry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import { CycleService, JournalsIndex, OpenDateFlow, journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";
import type { CommandConfig } from "./config";

function makeCommand(overrides: Partial<CommandConfig>): CommandConfig {
  return {
    name: "Cmd",
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
    ...overrides,
  };
}

async function build() {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, commandCollection],
  });
  const host = createFakeHost();
  const workspace = new FakeWorkspaceService();
  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(CommandService).useClass(CommandService);
  container.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.addModule(FlowsModule);
  container.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry);

  await settings.initialize();
  const lifecycle = container.resolve(JournalLifecycleService);
  const index = container.resolve(JournalsIndex);
  const flows = container.resolve(Flows);
  const registry = container.resolve(DynamicCommandRegistry);
  registry.initialize();

  return { host, workspace, settings, lifecycle, index, flows, commands: settings.getCollection(commandCollection) };
}

describe("DynamicCommandRegistry registration", () => {
  it("registers a command added to the collection", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({ name: "Open daily" }));
    expect(host.commands.get("cmd-1")?.name).toBe("Open daily");
  });

  it("unregisters a command removed from the collection", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({}));
    commands.remove("cmd-1");
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("re-registers a command when its definition changes", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({ name: "Old" }));
    const stored = commands.get("cmd-1");
    if (stored) stored.name = "New";
    expect(host.commands.get("cmd-1")?.name).toBe("New");
  });
});

describe("DynamicCommandRegistry availability", () => {
  it("is unavailable when no journal matches an all target", async () => {
    const { host, commands } = await build();
    commands.add("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available when a matching journal exists", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({}));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });

  it("is unavailable when the command type is unsupported for the write type", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("weekly", { type: "week" });
    commands.add("cmd-1", makeCommand({ target: { kind: "all", writeType: "week" }, type: "same_next_week" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is unavailable for only_open_note context without a matching active note", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(false);
  });

  it("is available for only_open_note context when the active note belongs to the target", async () => {
    const { host, commands, lifecycle, index, workspace } = await build();
    lifecycle.create("daily", { type: "day" });
    const path = "daily/2026-05-21.md" as VaultPath;
    index.register({ journalName: "daily", anchor: anchor("2026-05-21"), path });
    workspace.setActive(path);
    commands.add("cmd-1", makeCommand({ context: "only_open_note" }));
    expect(host.commands.get("cmd-1")?.checkCallback?.(true)).toBe(true);
  });
});

describe("DynamicCommandRegistry execution", () => {
  it("invokes OpenDateFlow with the resolved anchor and candidate journals", async () => {
    const { host, commands, lifecycle, flows } = await build();
    lifecycle.create("daily", { type: "day" });
    const invokeSpy = vi
      .spyOn(flows, "invoke")
      .mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }) as never);
    commands.add("cmd-1", makeCommand({ type: "same", context: "today", openMode: "split" }));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: CalendarDate.today().toAnchor(),
      journalNames: ["daily"],
      openMode: "split",
      existingOnly: false,
    });
  });

  it("does not invoke OpenDateFlow when the command is unavailable", async () => {
    const { host, commands, flows } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");
    commands.add("cmd-1", makeCommand({}));

    host.commands.get("cmd-1")?.checkCallback?.(false);

    expect(invokeSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/commands/command-registry.test.ts`
Expected: FAIL — cannot resolve `./command-registry`.

- [ ] **Step 3: Write the implementation**

Create `src/commands/command-registry.ts`:

```ts
import { match } from "ts-pattern";
import { watch } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { CommandService, WorkspaceService } from "@/infrastructure/host";
import type { CommandRegistration } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { Option } from "@/infrastructure/result";
import { CycleService, JournalsIndex, NoApplicableJournals, OpenDateFlow, journalConfigCollection } from "@/journals";
import type { JournalEntry } from "@/journals";
import { SettingsService } from "@/settings";

import { commandCollection } from "./config";
import type { CommandConfig } from "./config";
import { compoundShift, supportedTypes } from "./resolve";

interface CommandPlan {
  readonly anchor: AnchorString;
  readonly journalNames: readonly string[];
}

export class DynamicCommandRegistry {
  readonly #commands = inject(CommandService);
  readonly #settings = inject(SettingsService);
  readonly #flows = inject(Flows);
  readonly #workspace = inject(WorkspaceService);
  readonly #index = inject(JournalsIndex);
  readonly #cycle = inject(CycleService);
  readonly #logger = inject(LoggerFactoryToken).named("dynamic-commands");
  readonly #registered = new Map<string, string>();

  initialize(): void {
    this.#reconcile();
    watch(this.#commandEntries(), () => this.#reconcile(), { deep: true, flush: "sync" });
  }

  #commandEntries(): Readonly<Record<string, CommandConfig>> {
    return this.#settings.getCollection(commandCollection).entries;
  }

  #reconcile(): void {
    const entries = this.#commandEntries();
    for (const id of [...this.#registered.keys()]) {
      if (!(id in entries)) {
        this.#commands.unregister(id);
        this.#registered.delete(id);
      }
    }
    for (const [id, command] of Object.entries(entries)) {
      const serialized = JSON.stringify(command);
      if (this.#registered.get(id) === serialized) continue;
      if (this.#registered.has(id)) this.#commands.unregister(id);
      this.#commands.register(this.#registration(id, command));
      this.#registered.set(id, serialized);
    }
  }

  #registration(id: string, command: CommandConfig): CommandRegistration {
    return {
      id,
      name: command.name,
      icon: command.icon,
      ribbon: command.showInRibbon,
      check: () => this.#plan(command).isSome(),
      execute: () => this.#run(command),
    };
  }

  #plan(command: CommandConfig): Option<CommandPlan> {
    const journalNames = this.#candidates(command);
    const [rep] = journalNames;
    if (rep === undefined) return Option.none();
    const config = this.#settings.getCollection(journalConfigCollection).get(rep);
    if (config === undefined) return Option.none();
    if (!supportedTypes(config.write.type).includes(command.type)) return Option.none();
    return this.#reference(command, journalNames).flatMap((reference) =>
      this.#anchor(command, rep, reference).map((resolved) => ({ anchor: resolved, journalNames })),
    );
  }

  #candidates(command: CommandConfig): string[] {
    const journals = this.#settings.getCollection(journalConfigCollection);
    return match(command.target)
      .with({ kind: "all" }, (target) =>
        Object.keys(journals.entries).filter((name) => journals.get(name)?.write.type === target.writeType),
      )
      .with({ kind: "journal" }, (target) => (journals.get(target.journalName) ? [target.journalName] : []))
      .exhaustive();
  }

  #reference(command: CommandConfig, candidates: readonly string[]): Option<CalendarDate> {
    return match(command.context)
      .with("today", () => Option.some(CalendarDate.today()))
      .with("open_note", () =>
        Option.some(
          this.#activeEntry()
            .map((entry) => CalendarDate.fromAnchor(entry.anchor))
            .getOr(CalendarDate.today()),
        ),
      )
      .with("only_open_note", () =>
        this.#activeEntry()
          .filter((entry) => candidates.includes(entry.journalName))
          .map((entry) => CalendarDate.fromAnchor(entry.anchor)),
      )
      .exhaustive();
  }

  #activeEntry(): Option<JournalEntry> {
    return this.#workspace.activeNote().flatMap((path) => this.#index.entryByPath(path));
  }

  #anchor(command: CommandConfig, journalName: string, reference: CalendarDate): Option<AnchorString> {
    return match(command.type)
      .with("same", () => this.#cycle.anchorOf(journalName, reference))
      .with("next", () =>
        this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.nextAnchor(journalName, a)),
      )
      .with("previous", () =>
        this.#cycle.anchorOf(journalName, reference).flatMap((a) => this.#cycle.previousAnchor(journalName, a)),
      )
      .otherwise((type) => {
        const shift = compoundShift(type);
        if (shift === null) return Option.none<AnchorString>();
        return this.#cycle.anchorOf(journalName, reference.shift(shift.amount, shift.unit));
      });
  }

  async #run(command: CommandConfig): Promise<void> {
    const plan = this.#plan(command);
    if (!plan.isSome()) return;
    const result = await this.#flows.invoke(OpenDateFlow, {
      anchor: plan.value.anchor,
      journalNames: plan.value.journalNames,
      openMode: command.openMode,
      existingOnly: false,
    });
    if (result.kind === "err") {
      const { error } = result;
      if (error instanceof UserAborted || error instanceof NoApplicableJournals) return;
      this.#logger.error("dynamic command failed", { command: command.name, error });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/commands/command-registry.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Run quality gates and commit**

```bash
npm run check:types
npm run check:lint
git add src/commands/command-registry.ts src/commands/command-registry.test.ts
git commit -m "feat(commands): add DynamicCommandRegistry for dynamic command registration"
```

---

## Task 5: DynamicCommandRegistry — journal lifecycle cascade

The registry subscribes to `JournalLifecycleService` events: a rename rewrites `journal`-target commands; a delete removes them. The collection edits flow through the same `watch` reconcile path.

**Files:**

- Modify: `src/commands/command-registry.ts`
- Test: `src/commands/command-registry.test.ts` (append a new `describe` block)

- [ ] **Step 1: Write the failing test**

Append to `src/commands/command-registry.test.ts`:

```ts
describe("DynamicCommandRegistry journal cascade", () => {
  it("rewrites the journal name on rename and keeps the command registered", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ target: { kind: "journal", journalName: "daily" } }));

    lifecycle.rename("daily", "morning");

    expect(commands.get("cmd-1")?.target).toEqual({ kind: "journal", journalName: "morning" });
    expect(host.commands.get("cmd-1")).toBeDefined();
  });

  it("removes a journal-target command when its journal is deleted", async () => {
    const { host, commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ target: { kind: "journal", journalName: "daily" } }));

    lifecycle.delete("daily");

    expect(commands.get("cmd-1")).toBeUndefined();
    expect(host.commands.get("cmd-1")).toBeUndefined();
  });

  it("leaves an all-target command untouched when a journal is deleted", async () => {
    const { commands, lifecycle } = await build();
    lifecycle.create("daily", { type: "day" });
    commands.add("cmd-1", makeCommand({ target: { kind: "all", writeType: "day" } }));

    lifecycle.delete("daily");

    expect(commands.get("cmd-1")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/commands/command-registry.test.ts`
Expected: FAIL — the rename test still sees `journalName: "daily"`; the delete test still finds `cmd-1`.

- [ ] **Step 3: Write the implementation**

In `src/commands/command-registry.ts`:

Add `JournalLifecycleService` to the `@/journals/settings/lifecycle` import (a new import line — it is not re-exported from `@/journals`):

```ts
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
```

Add the injected field after the existing `#cycle` field:

```ts
  readonly #lifecycle = inject(JournalLifecycleService);
```

Extend `initialize()` to subscribe to the lifecycle events:

```ts
  initialize(): void {
    this.#reconcile();
    watch(this.#commandEntries(), () => this.#reconcile(), { deep: true, flush: "sync" });
    this.#lifecycle.events.on("journalRenamed", ({ oldName, newName }) =>
      this.#onJournalRenamed(oldName, newName),
    );
    this.#lifecycle.events.on("journalDeleted", ({ journalName }) => this.#onJournalDeleted(journalName));
  }
```

Add these two methods to the class:

```ts
  #onJournalRenamed(oldName: string, newName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "journal" && command.target.journalName === oldName) {
        command.target.journalName = newName;
      }
    }
  }

  #onJournalDeleted(journalName: string): void {
    const collection = this.#settings.getCollection(commandCollection);
    for (const id of Object.keys(collection.entries)) {
      const command = collection.get(id);
      if (command?.target.kind === "journal" && command.target.journalName === journalName) {
        collection.remove(id);
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/commands/command-registry.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Run quality gates and commit**

```bash
npm run check:types
npm run check:lint
git add src/commands/command-registry.ts src/commands/command-registry.test.ts
git commit -m "feat(commands): cascade journal rename and delete to dynamic commands"
```

---

## Task 6: Module wiring

Wire the feature into DI: a module value, a barrel, and `main.ts`. There is no test — module composition and barrels are wiring, exercised by the e2e smoke run.

**Files:**

- Create: `src/commands/module.ts`
- Create: `src/commands/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create the module**

Create `src/commands/module.ts`:

```ts
import type { Module } from "@/infrastructure/di";
import { CollectionDefinitionToken } from "@/settings";

import { DynamicCommandRegistry } from "./command-registry";
import { commandCollection } from "./config";

export const commandsModule: Module = {
  register(c) {
    c.register(CollectionDefinitionToken).useValue(commandCollection);
    c.register(DynamicCommandRegistry).useClass(DynamicCommandRegistry).eager();
  },
};
```

- [ ] **Step 2: Create the barrel**

Create `src/commands/index.ts`:

```ts
export { commandCollection } from "./config";
export type { CommandConfig, CommandContext, CommandTarget, CommandType } from "./config";
export { commandsModule } from "./module";
```

- [ ] **Step 3: Wire into `main.ts`**

In `src/main.ts`, add the import alongside the other feature imports (after the `journalsSettingsModule` import line):

```ts
import { commandsModule } from "@/commands";
import { DynamicCommandRegistry } from "@/commands/command-registry";
```

Add the module registration after `container.addModule(journalsSettingsModule);`:

```ts
container.addModule(commandsModule);
```

Add the registry initialization after the existing `await container.resolve(AutoCreateService).initialize();` line:

```ts
container.resolve(DynamicCommandRegistry).initialize();
```

- [ ] **Step 4: Run quality gates**

```bash
npm run check:types
npm run check:lint
npm run test
```

Expected: all PASS — the full test suite confirms the new module wires in cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/commands/module.ts src/commands/index.ts src/main.ts
git commit -m "feat(commands): register the dynamic commands module"
```

---

## Done

After Task 6 the unified dynamic command collection is live: user commands in the `commands` settings collection register as Obsidian commands, resolve dates through the journal cycles, open via `OpenDateFlow`, and cascade on journal rename/delete. The settings UI for creating and editing these commands is a separate follow-up spec.
