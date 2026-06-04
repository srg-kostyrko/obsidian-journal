# Obsidian URI scheme for journal entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `obsidian://journals` URI that opens — creating with template, frontmatter, and navigation if missing — a journal entry addressed by journal name or write-type plus an optional date.

**Architecture:** A thin host `UriService` wraps `Plugin.registerObsidianProtocolHandler`, and a host `NoticeService` wraps `Notice`. A new `src/journals/uri/` sub-feature has a pure parser (`parse-request.ts`) that turns raw query params into a validated request, and a `JournalUriHandler` that registers the protocol action, resolves candidate journals + a period anchor, and dispatches to the existing `OpenDateFlow`. No flow changes are needed — `OpenDateFlow` already does template creation, frontmatter, navigation, the multi-journal picker, and opening.

**Tech Stack:** TypeScript, Obsidian plugin API, custom DI container (`@/infrastructure/di`), Result/Option monads (`@/infrastructure/result`), ts-pattern, valibot-derived journal config, paraglide i18n (`@/i18n`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-obsidian-uri-scheme-design.md`

---

## File Structure

**Create:**

- `src/infrastructure/host/internal/notice-service.ts` — `NoticeService` (wraps `new Notice`).
- `src/infrastructure/host/internal/notice-service.test.ts` — its test.
- `src/infrastructure/host/uri/types.ts` — `UriParams`, `UriHandler` public types.
- `src/infrastructure/host/uri/index.ts` — barrel for the host uri unit.
- `src/infrastructure/host/uri/internal/uri-service.ts` — `UriService` (wraps `registerObsidianProtocolHandler`).
- `src/infrastructure/host/uri/internal/uri-service.test.ts` — its test.
- `src/journals/uri/errors.ts` — `UriError` union + subclasses.
- `src/journals/uri/parse-request.ts` — pure `parseJournalUriRequest` + request types.
- `src/journals/uri/parse-request.test.ts` — parser tests.
- `src/journals/uri/journal-uri-handler.ts` — `JournalUriHandler` dispatcher.
- `src/journals/uri/journal-uri-handler.test.ts` — handler tests.
- `src/journals/uri/module.ts` — `journalUriModule` DI wiring.
- `src/journals/uri/index.ts` — barrel.

**Modify:**

- `src/infrastructure/host/internal/testing.ts` — `FakeHost` gains protocol-handler capture.
- `src/infrastructure/host/testing.ts` — add `FakeNoticeService`.
- `src/infrastructure/host/module.ts` — register `NoticeService` and `UriService`.
- `src/infrastructure/host/index.ts` — export `NoticeService`, `UriService`, `UriParams`, `UriHandler`.
- `src/journals/module.ts` — compose `journalUriModule`.
- `src/journals/index.ts` — export `JournalUriHandler`.
- `messages/en.json` — add `uri_*` messages.
- `src/main.ts` — import and `initialize()` the handler.

---

## Task 1: Host `NoticeService` (+ fake)

A type-less host service wrapping `new Notice`, so feature code can surface user-facing notices without importing `obsidian`. Mirrors the placement of other single-file host services (`workspace-service.ts`, `notes-service.ts`).

**Files:**

- Create: `src/infrastructure/host/internal/notice-service.ts`
- Test: `src/infrastructure/host/internal/notice-service.test.ts`
- Modify: `src/infrastructure/host/testing.ts`
- Modify: `src/infrastructure/host/module.ts`
- Modify: `src/infrastructure/host/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/infrastructure/host/internal/notice-service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { NoticeService } from "./notice-service";

const noticeConstructor = vi.fn();
vi.mock("obsidian", () => ({
  Notice: class {
    constructor(message: string) {
      noticeConstructor(message);
    }
  },
}));

describe("NoticeService", () => {
  it("shows a notice with the given message", () => {
    noticeConstructor.mockClear();
    new NoticeService().show("Something happened");
    expect(noticeConstructor).toHaveBeenCalledWith("Something happened");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/infrastructure/host/internal/notice-service.test.ts`
Expected: FAIL — cannot find module `./notice-service`.

- [ ] **Step 3: Write the implementation**

Create `src/infrastructure/host/internal/notice-service.ts`:

```typescript
import { Notice } from "obsidian";

export class NoticeService {
  show(message: string): void {
    new Notice(message);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/infrastructure/host/internal/notice-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the fake to the host testing barrel**

In `src/infrastructure/host/testing.ts`, add the import near the other internal-service type imports (with the `import type { NotesService } ...` group):

```typescript
import type { NoticeService } from "./internal/notice-service";
```

Then add this class to the file (next to `FakeNoteMetadataService`, above the final `export { FakeModalHandle, FakeModalService } from "./modals/testing";` line):

```typescript
export class FakeNoticeService implements Pick<NoticeService, "show"> {
  readonly messages: string[] = [];

  show(message: string): void {
    this.messages.push(message);
  }
}
```

- [ ] **Step 6: Register the service and export it**

In `src/infrastructure/host/module.ts`, add the import (with the other internal imports):

```typescript
import { NoticeService } from "./internal/notice-service";
```

and register it inside `register(c)` (next to the other `useClass` registrations):

```typescript
c.register(NoticeService).useClass(NoticeService);
```

In `src/infrastructure/host/index.ts`, add an export next to the other internal-service exports (e.g. below the `NotesService` export line):

```typescript
export { NoticeService } from "./internal/notice-service";
```

- [ ] **Step 7: Run the full check for this slice**

Run: `npx vitest run src/infrastructure/host/internal/notice-service.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/host/internal/notice-service.ts src/infrastructure/host/internal/notice-service.test.ts src/infrastructure/host/testing.ts src/infrastructure/host/module.ts src/infrastructure/host/index.ts
git commit -m "feat(host): add NoticeService"
```

---

## Task 2: Host `UriService` (+ fake host protocol support)

Wraps `Plugin.registerObsidianProtocolHandler`. Obsidian removes the handler on plugin unload, so the service needs no teardown. Layout mirrors `src/infrastructure/host/commands/`.

**Files:**

- Create: `src/infrastructure/host/uri/types.ts`
- Create: `src/infrastructure/host/uri/index.ts`
- Create: `src/infrastructure/host/uri/internal/uri-service.ts`
- Test: `src/infrastructure/host/uri/internal/uri-service.test.ts`
- Modify: `src/infrastructure/host/internal/testing.ts`
- Modify: `src/infrastructure/host/module.ts`
- Modify: `src/infrastructure/host/index.ts`

- [ ] **Step 1: Teach the fake host to capture protocol handlers**

In `src/infrastructure/host/internal/testing.ts`:

Add to the `FakeHost` interface (next to `readonly commands: Map<string, Command>;`):

```typescript
  readonly protocolHandlers: Map<string, (params: Record<string, string>) => void>;
  emitProtocol(action: string, params: Record<string, string>): void;
```

Inside `createFakeHost()`, declare the backing map next to `const commands = new Map<string, Command>();`:

```typescript
const protocolHandlers = new Map<string, (params: Record<string, string>) => void>();
```

Add the method to the fake `plugin` object (next to `addCommand`):

```typescript
    registerObsidianProtocolHandler(action: string, handler: (params: Record<string, string>) => void): void {
      protocolHandlers.set(action, handler);
    },
```

Add `protocolHandlers` to the returned object (next to `commands,`):

```typescript
    protocolHandlers,
```

Add the `emitProtocol` helper to the returned object (next to `triggerUnload`):

```typescript
    emitProtocol(action, params): void {
      protocolHandlers.get(action)?.(params);
    },
```

- [ ] **Step 2: Write the failing test**

Create `src/infrastructure/host/uri/internal/uri-service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";

import { createFakeHost } from "../../internal/testing";
import { InternalPluginToken } from "../../internal/tokens";

import { UriService } from "./uri-service";

function build() {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(UriService).useClass(UriService);
  return { service: c.resolve(UriService), host };
}

describe("UriService", () => {
  it("registers a protocol handler for the given action", () => {
    const { service, host } = build();
    service.register("journals", vi.fn());
    expect(host.protocolHandlers.has("journals")).toBe(true);
  });

  it("forwards the protocol params to the handler", () => {
    const { service, host } = build();
    const handler = vi.fn();
    service.register("journals", handler);
    host.emitProtocol("journals", { action: "journals", journal: "Daily" });
    expect(handler).toHaveBeenCalledWith({ action: "journals", journal: "Daily" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/infrastructure/host/uri/internal/uri-service.test.ts`
Expected: FAIL — cannot find module `./uri-service`.

- [ ] **Step 4: Write the public types**

Create `src/infrastructure/host/uri/types.ts`:

```typescript
export type UriParams = Record<string, string>;

export type UriHandler = (params: UriParams) => void;
```

- [ ] **Step 5: Write the service**

Create `src/infrastructure/host/uri/internal/uri-service.ts`:

```typescript
import { inject } from "@/infrastructure/di";

import { InternalPluginToken } from "../../internal/tokens";

import type { UriHandler } from "../types";

export class UriService {
  readonly #plugin = inject(InternalPluginToken);

  register(action: string, handler: UriHandler): void {
    this.#plugin.registerObsidianProtocolHandler(action, (params) => {
      handler(params);
    });
  }
}
```

- [ ] **Step 6: Write the unit barrel**

Create `src/infrastructure/host/uri/index.ts`:

```typescript
export { UriService } from "./internal/uri-service";
export type { UriHandler, UriParams } from "./types";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/infrastructure/host/uri/internal/uri-service.test.ts`
Expected: PASS.

- [ ] **Step 8: Register and export the service**

In `src/infrastructure/host/module.ts`, add the import (with the other unit imports such as `CommandService`):

```typescript
import { UriService } from "./uri/internal/uri-service";
```

and register it inside `register(c)`:

```typescript
c.register(UriService).useClass(UriService);
```

In `src/infrastructure/host/index.ts`, add (next to the `CommandService` export):

```typescript
export { UriService, type UriHandler, type UriParams } from "./uri";
```

- [ ] **Step 9: Type-check**

Run: `npm run check:types`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/infrastructure/host/uri src/infrastructure/host/internal/testing.ts src/infrastructure/host/module.ts src/infrastructure/host/index.ts
git commit -m "feat(host): add UriService for obsidian protocol handlers"
```

---

## Task 3: URI request parser (pure)

A pure function with no Obsidian dependency: turns the raw query-param record into a validated `JournalUriRequest` or a typed `UriError`. Holds the date grammar, the `type`/`mode` enumerations, and the rule that `journal` wins over `type`.

**Files:**

- Create: `src/journals/uri/errors.ts`
- Create: `src/journals/uri/parse-request.ts`
- Test: `src/journals/uri/parse-request.test.ts`

- [ ] **Step 1: Write the errors**

Create `src/journals/uri/errors.ts`:

```typescript
export class MissingUriTargetError extends Error {
  readonly kind = "missing-target" as const;

  constructor() {
    super("URI is missing a journal or type parameter");
    this.name = "MissingUriTargetError";
  }
}

export class UnknownUriWriteTypeError extends Error {
  readonly kind = "unknown-write-type" as const;

  constructor(readonly value: string) {
    super(`Unknown journal type in URI: ${value}`);
    this.name = "UnknownUriWriteTypeError";
  }
}

export class InvalidUriDateError extends Error {
  readonly kind = "invalid-date" as const;

  constructor(readonly value: string) {
    super(`Could not parse date in URI: ${value}`);
    this.name = "InvalidUriDateError";
  }
}

export class InvalidUriOpenModeError extends Error {
  readonly kind = "invalid-mode" as const;

  constructor(readonly value: string) {
    super(`Unknown open mode in URI: ${value}`);
    this.name = "InvalidUriOpenModeError";
  }
}

export type UriError = MissingUriTargetError | UnknownUriWriteTypeError | InvalidUriDateError | InvalidUriOpenModeError;
```

- [ ] **Step 2: Write the failing parser test**

Create `src/journals/uri/parse-request.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { CalendarDate } from "@/calendar";

import { parseJournalUriRequest } from "./parse-request";

function ok(params: Record<string, string | undefined>) {
  const result = parseJournalUriRequest(params);
  if (result.isErr()) throw new Error(`expected ok, got ${result.error.kind}`);
  return result.value;
}

function errKind(params: Record<string, string | undefined>): string {
  const result = parseJournalUriRequest(params);
  if (result.isOk()) throw new Error("expected err");
  return result.error.kind;
}

describe("parseJournalUriRequest target", () => {
  it("reads a journal name target", () => {
    expect(ok({ journal: "Daily" }).target).toEqual({ kind: "journal", name: "Daily" });
  });

  it("reads a write-type target", () => {
    expect(ok({ type: "week" }).target).toEqual({ kind: "type", writeType: "week" });
  });

  it("prefers the journal name when both journal and type are present", () => {
    expect(ok({ journal: "Daily", type: "week" }).target).toEqual({ kind: "journal", name: "Daily" });
  });

  it("rejects params with neither journal nor type", () => {
    expect(errKind({})).toBe("missing-target");
  });

  it("rejects an unknown write type", () => {
    expect(errKind({ type: "fortnight" })).toBe("unknown-write-type");
  });
});

describe("parseJournalUriRequest date", () => {
  it("defaults to today when date is absent", () => {
    expect(ok({ journal: "Daily" }).date.toAnchor()).toBe(CalendarDate.today().toAnchor());
  });

  it("defaults to today for the today keyword", () => {
    expect(ok({ journal: "Daily", date: "today" }).date.toAnchor()).toBe(CalendarDate.today().toAnchor());
  });

  it("reads an ISO date", () => {
    expect(ok({ journal: "Daily", date: "2026-06-04" }).date.toAnchor()).toBe("2026-06-04");
  });

  it("reads a positive relative day offset", () => {
    expect(ok({ journal: "Daily", date: "+1d" }).date.toAnchor()).toBe(CalendarDate.today().shift(1, "d").toAnchor());
  });

  it("reads a negative relative week offset", () => {
    expect(ok({ journal: "Daily", date: "-2w" }).date.toAnchor()).toBe(CalendarDate.today().shift(-2, "w").toAnchor());
  });

  it("rejects an unparseable date", () => {
    expect(errKind({ journal: "Daily", date: "not-a-date" })).toBe("invalid-date");
  });

  it("rejects a relative offset with an unknown unit", () => {
    expect(errKind({ journal: "Daily", date: "+1x" })).toBe("invalid-date");
  });
});

describe("parseJournalUriRequest open mode", () => {
  it("defaults to active when mode is absent", () => {
    expect(ok({ journal: "Daily" }).openMode).toBe("active");
  });

  it("reads a tab mode", () => {
    expect(ok({ journal: "Daily", mode: "tab" }).openMode).toBe("tab");
  });

  it("rejects an unknown mode", () => {
    expect(errKind({ journal: "Daily", mode: "popup" })).toBe("invalid-mode");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/journals/uri/parse-request.test.ts`
Expected: FAIL — cannot find module `./parse-request`.

- [ ] **Step 4: Write the parser**

Create `src/journals/uri/parse-request.ts`:

```typescript
import { CalendarDate } from "@/calendar";
import { Err, Ok } from "@/infrastructure/result";

import {
  InvalidUriDateError,
  InvalidUriOpenModeError,
  MissingUriTargetError,
  UnknownUriWriteTypeError,
} from "./errors";

import type { OpenMode } from "@/infrastructure/host";
import type { Result } from "@/infrastructure/result";
import type { UriError } from "./errors";

const WRITE_TYPES = ["day", "week", "month", "quarter", "year"] as const;
const OPEN_MODES = ["active", "tab", "split", "window"] as const;
const RELATIVE_DATE = /^([+-])(\d+)([dwmqy])$/;

export type JournalUriWriteType = (typeof WRITE_TYPES)[number];

export type JournalUriTarget =
  | { readonly kind: "journal"; readonly name: string }
  | { readonly kind: "type"; readonly writeType: JournalUriWriteType };

export interface JournalUriRequest {
  readonly target: JournalUriTarget;
  readonly date: CalendarDate;
  readonly openMode: OpenMode;
}

export function parseJournalUriRequest(
  params: Record<string, string | undefined>,
): Result<JournalUriRequest, UriError> {
  const target = parseTarget(params);
  if (target.isErr()) return new Err(target.error);

  const date = parseDate(params.date);
  if (date.isErr()) return new Err(date.error);

  const openMode = parseOpenMode(params.mode);
  if (openMode.isErr()) return new Err(openMode.error);

  return new Ok({ target: target.value, date: date.value, openMode: openMode.value });
}

function parseTarget(params: Record<string, string | undefined>): Result<JournalUriTarget, UriError> {
  const name = params.journal?.trim();
  if (name) return new Ok({ kind: "journal", name });

  const type = params.type?.trim();
  if (!type) return new Err(new MissingUriTargetError());
  if (!isWriteType(type)) return new Err(new UnknownUriWriteTypeError(type));
  return new Ok({ kind: "type", writeType: type });
}

function parseDate(raw: string | undefined): Result<CalendarDate, UriError> {
  const value = raw?.trim();
  if (!value || value === "today") return new Ok(CalendarDate.today());

  const relative = RELATIVE_DATE.exec(value);
  if (relative) {
    const sign = relative[1] === "-" ? -1 : 1;
    const amount = sign * Number(relative[2]);
    const unit = relative[3] as "d" | "w" | "m" | "q" | "y";
    return new Ok(CalendarDate.today().shift(amount, unit));
  }

  const parsed = CalendarDate.parse(value);
  if (parsed.isErr()) return new Err(new InvalidUriDateError(value));
  return new Ok(parsed.value);
}

function parseOpenMode(raw: string | undefined): Result<OpenMode, UriError> {
  const value = raw?.trim();
  if (!value) return new Ok("active");
  if (!isOpenMode(value)) return new Err(new InvalidUriOpenModeError(value));
  return new Ok(value);
}

function isWriteType(value: string): value is JournalUriWriteType {
  return (WRITE_TYPES as readonly string[]).includes(value);
}

function isOpenMode(value: string): value is OpenMode {
  return (OPEN_MODES as readonly string[]).includes(value);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/journals/uri/parse-request.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Type-check**

Run: `npm run check:types`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/journals/uri/errors.ts src/journals/uri/parse-request.ts src/journals/uri/parse-request.test.ts
git commit -m "feat(journals): add URI request parser"
```

---

## Task 4: `JournalUriHandler` dispatcher (+ messages)

Registers the `journals` protocol action, resolves the parsed request to candidate journals + a single period anchor (mirroring `DynamicCommandRegistry`), and invokes `OpenDateFlow`. Surfaces every failure as a localized notice.

**Files:**

- Create: `src/journals/uri/journal-uri-handler.ts`
- Test: `src/journals/uri/journal-uri-handler.test.ts`
- Modify: `messages/en.json`

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add these keys (place them after the `templater_*` / `timeline_*` keys and before the `view_*` keys to keep the file roughly grouped; any valid JSON position works):

```json
  "uri_missing_target": "Journal URI needs a \"journal\" or \"type\" parameter.",
  "uri_unknown_write_type": "Unknown journal type \"{type}\" in the URI.",
  "uri_invalid_date": "Could not understand the date \"{date}\" in the URI.",
  "uri_invalid_mode": "Unknown open mode \"{mode}\" in the URI.",
  "uri_unknown_journal": "There is no journal named \"{journal}\".",
  "uri_no_journal": "No journal covers that date.",
  "uri_open_failed": "Could not open the journal entry.",
```

(Ensure the preceding line ends with a comma and JSON stays valid.)

- [ ] **Step 2: Compile the i18n messages**

Run: `npm run compile:i18n`
Expected: regenerates `src/i18n/paraglide/` (gitignored) so `m.uri_*` exist. No files to commit from this step.

- [ ] **Step 3: Write the failing handler test**

Create `src/journals/uri/journal-uri-handler.test.ts`:

```typescript
import { createNanoEvents } from "nanoevents";
import { describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Flows, FlowsModule, UserAborted } from "@/infrastructure/flows";
import { NoticeService, UriService } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalPluginToken } from "@/infrastructure/host/internal/tokens";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { AsyncResult } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsEventsToken,
  NoApplicableJournals,
  OpenDateFlow,
  journalConfigCollection,
} from "@/journals";
import type { JournalsEvents } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { JournalUriHandler } from "./journal-uri-handler";

async function build() {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
  });
  await settings.initialize();

  const journalsStorage = settings.recordOf(journalConfigCollection);
  const journalsEvents = createNanoEvents<JournalsEvents>();
  const journalsRepo = JournalsRepository.fromParts(journalsStorage, journalsEvents);

  const host = createFakeHost();
  const notices = new FakeNoticeService();

  container.register(InternalPluginToken).useValue(host.plugin);
  container.register(UriService).useClass(UriService);
  container.register(NoticeService).useValue(notices as unknown as NoticeService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsEventsToken).useValue(journalsEvents);
  container.register(JournalsRepository).useValue(journalsRepo);
  container.addModule(FlowsModule);
  container.register(JournalUriHandler).useClass(JournalUriHandler);

  const flows = container.resolve(Flows);
  const handler = container.resolve(JournalUriHandler);
  handler.initialize();

  function trigger(params: Record<string, string>): void {
    host.emitProtocol("journals", { action: "journals", ...params });
  }

  return { host, journalsRepo, notices, flows, trigger };
}

describe("JournalUriHandler dispatch", () => {
  it("invokes OpenDateFlow for a named journal and ISO date", async () => {
    const { journalsRepo, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    trigger({ journal: "daily", date: "2026-06-04", mode: "tab" });
    await Promise.resolve();

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: "2026-06-04",
      journalNames: ["daily"],
      openMode: "tab",
      existingOnly: false,
    });
  });

  it("defaults to today when no date is given", async () => {
    const { journalsRepo, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    trigger({ journal: "daily" });
    await Promise.resolve();

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: CalendarDate.today().toAnchor(),
      journalNames: ["daily"],
      openMode: "active",
      existingOnly: false,
    });
  });

  it("passes every journal of a write type as candidates", async () => {
    const { journalsRepo, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    journalsRepo.create("work", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ path: "daily/x.md", created: false }));

    trigger({ type: "day", date: "2026-06-04" });
    await Promise.resolve();

    expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
      anchor: "2026-06-04",
      journalNames: ["daily", "work"],
      openMode: "active",
      existingOnly: false,
    });
  });
});

describe("JournalUriHandler errors", () => {
  it("notifies and opens nothing for an unknown journal name", async () => {
    const { notices, flows, trigger } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");

    trigger({ journal: "missing" });
    await Promise.resolve();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
  });

  it("notifies and opens nothing for an unparseable date", async () => {
    const { journalsRepo, notices, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    const invokeSpy = vi.spyOn(flows, "invoke");

    trigger({ journal: "daily", date: "not-a-date" });
    await Promise.resolve();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
  });

  it("notifies when no journal of the requested type exists", async () => {
    const { notices, flows, trigger } = await build();
    const invokeSpy = vi.spyOn(flows, "invoke");

    trigger({ type: "week" });
    await Promise.resolve();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(notices.messages).toHaveLength(1);
  });

  it("notifies when the flow reports no applicable journals", async () => {
    const { journalsRepo, notices, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.err(new NoApplicableJournals(anchor("2026-06-04"))));

    trigger({ journal: "daily", date: "2026-06-04" });
    await Promise.resolve();

    expect(notices.messages).toHaveLength(1);
  });

  it("stays silent when the journal picker is dismissed", async () => {
    const { journalsRepo, notices, flows, trigger } = await build();
    journalsRepo.create("daily", { type: "day" });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.err(new UserAborted("journal-picker")));

    trigger({ journal: "daily" });
    await Promise.resolve();

    expect(notices.messages).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/journals/uri/journal-uri-handler.test.ts`
Expected: FAIL — cannot find module `./journal-uri-handler`.

- [ ] **Step 5: Write the handler**

Create `src/journals/uri/journal-uri-handler.ts`:

```typescript
import { match } from "ts-pattern";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService, UriService } from "@/infrastructure/host";
import { LoggerFactoryToken } from "@/infrastructure/logger";

import { CycleService } from "../cycle";
import { OpenDateFlow } from "../flows/open-date.flow";
import { NoApplicableJournals } from "../notes/errors";
import { JournalsRepository } from "../repository";

import { parseJournalUriRequest } from "./parse-request";

import type { UriParams } from "@/infrastructure/host";
import type { UriError } from "./errors";
import type { JournalUriRequest } from "./parse-request";

const URI_ACTION = "journals";

export class JournalUriHandler {
  readonly #uri = inject(UriService);
  readonly #flows = inject(Flows);
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #notices = inject(NoticeService);
  readonly #logger = inject(LoggerFactoryToken).named("journal-uri");

  initialize(): void {
    this.#uri.register(URI_ACTION, (params) => {
      void this.#handle(params);
    });
  }

  async #handle(params: UriParams): Promise<void> {
    const parsed = parseJournalUriRequest(params);
    if (parsed.isErr()) {
      this.#notices.show(this.#messageFor(parsed.error));
      return;
    }

    const { target, date, openMode } = parsed.value;

    if (target.kind === "journal" && this.#journals.get(target.name).isNone()) {
      this.#notices.show(m.uri_unknown_journal({ journal: target.name }));
      return;
    }

    const candidates = this.#candidates(parsed.value);
    const [representative] = candidates;
    if (representative === undefined) {
      this.#notices.show(m.uri_no_journal());
      return;
    }

    const anchor = this.#cycle.anchorOf(representative, date);
    if (!anchor.isSome()) {
      this.#notices.show(m.uri_no_journal());
      return;
    }

    const result = await this.#flows.invoke(OpenDateFlow, {
      anchor: anchor.value,
      journalNames: candidates,
      openMode,
      existingOnly: false,
    });

    if (result.isErr()) {
      const { error } = result;
      if (error instanceof UserAborted) return;
      if (error instanceof NoApplicableJournals) {
        this.#notices.show(m.uri_no_journal());
        return;
      }
      this.#logger.error("journal uri open failed", { error });
      this.#notices.show(m.uri_open_failed());
    }
  }

  #candidates(request: JournalUriRequest): string[] {
    if (request.target.kind === "journal") return [request.target.name];
    const { writeType } = request.target;
    return [...this.#journals.find().entries()]
      .filter(([, config]) => config.write.type === writeType)
      .map(([name]) => name);
  }

  #messageFor(error: UriError): string {
    return match(error)
      .with({ kind: "missing-target" }, () => m.uri_missing_target())
      .with({ kind: "unknown-write-type" }, (e) => m.uri_unknown_write_type({ type: e.value }))
      .with({ kind: "invalid-date" }, (e) => m.uri_invalid_date({ date: e.value }))
      .with({ kind: "invalid-mode" }, (e) => m.uri_invalid_mode({ mode: e.value }))
      .exhaustive();
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/journals/uri/journal-uri-handler.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Type-check**

Run: `npm run check:types`
Expected: no errors. (If `m.uri_*` are reported missing, re-run `npm run compile:i18n` from Step 2.)

- [ ] **Step 8: Commit**

```bash
git add src/journals/uri/journal-uri-handler.ts src/journals/uri/journal-uri-handler.test.ts messages/en.json
git commit -m "feat(journals): add JournalUriHandler dispatcher"
```

---

## Task 5: Wiring (module, barrels, main.ts)

Compose the sub-feature module, export the handler, and initialize it on plugin load — alongside the other initialized services.

**Files:**

- Create: `src/journals/uri/module.ts`
- Create: `src/journals/uri/index.ts`
- Modify: `src/journals/module.ts`
- Modify: `src/journals/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Write the sub-feature module**

Create `src/journals/uri/module.ts`:

```typescript
import type { Module } from "@/infrastructure/di";

import { JournalUriHandler } from "./journal-uri-handler";

export const journalUriModule: Module = {
  register(c) {
    c.register(JournalUriHandler).useClass(JournalUriHandler);
  },
};
```

- [ ] **Step 2: Write the sub-feature barrel**

Create `src/journals/uri/index.ts`:

```typescript
export { JournalUriHandler } from "./journal-uri-handler";
export { journalUriModule } from "./module";
```

- [ ] **Step 3: Compose the module inside journalsModule**

In `src/journals/module.ts`, add the import (with the other sub-module imports such as `journalNotesModule`):

```typescript
import { journalUriModule } from "./uri/module";
```

and call it at the end of `register(c)` (next to `journalFlowsModule.register(c);`):

```typescript
journalUriModule.register(c);
```

- [ ] **Step 4: Export the handler from the journals barrel**

In `src/journals/index.ts`, add (next to the other re-exports, e.g. below the `OpenDateFlow` export):

```typescript
export { JournalUriHandler } from "./uri";
```

- [ ] **Step 5: Initialize the handler on plugin load**

In `src/main.ts`:

Add `JournalUriHandler` to the existing `@/journals` import (line currently importing `AutoAttachService, AutoCreateService, StartupOpenService`):

```typescript
import { AutoAttachService, AutoCreateService, JournalUriHandler, StartupOpenService } from "@/journals";
```

Add the initialize call right after `container.resolve(DynamicCommandRegistry).initialize();`:

```typescript
container.resolve(JournalUriHandler).initialize();
```

- [ ] **Step 6: Full type-check and lint**

Run: `npm run check:types`
Expected: no errors.

Run: `npm run check:lint`
Expected: no errors. (If import-order errors appear, reorder per the messages — external imports first, then `@/` groups, then relative imports, type-only imports in their group.)

- [ ] **Step 7: Full test suite**

Run: `npm run test`
Expected: all tests pass, including the new uri tests.

- [ ] **Step 8: Commit**

```bash
git add src/journals/uri/module.ts src/journals/uri/index.ts src/journals/module.ts src/journals/index.ts src/main.ts
git commit -m "feat(journals): wire up obsidian URI scheme (#85)"
```

---

## Manual verification (after all tasks)

Build the plugin into a test vault and try, with a `Daily` (day) journal configured:

- `obsidian://journals?vault=<vault>&journal=Daily` → opens/creates today's daily entry with template + nav.
- `obsidian://journals?vault=<vault>&journal=Daily&date=2026-06-04&mode=tab` → opens that date in a new tab.
- `obsidian://journals?vault=<vault>&type=day` → opens today's daily; with two day journals, a picker appears.
- `obsidian://journals?vault=<vault>&date=2026-06-04` (no journal/type) → notice, nothing opens.
- `obsidian://journals?vault=<vault>&journal=Nope` → notice, nothing opens.

(`vault` is the vault name; URLs can be triggered from a browser, the terminal `xdg-open`/`open`, or another app.)

---

## Self-Review notes

- **Spec coverage:** open-or-create (Task 4 via `OpenDateFlow`, `existingOnly:false`); `journal`/`type` addressing with `journal` winning (Task 3 `parseTarget`); date ISO/`today`/relative (Task 3 `parseDate`); `mode` (Task 3 `parseOpenMode`); picker reuse + timeline filtering (Task 4 candidates + `OpenDateFlow`); every error → notice, picker-dismiss silent (Task 4 + messages). All acceptance scenarios map to tests in Task 3/4.
- **Out of scope (per spec):** background-create, append, open-only — not built.
- **Type/name consistency:** `parseJournalUriRequest`, `JournalUriRequest`, `JournalUriTarget`, `JournalUriWriteType`, `UriError` (with `kind` discriminants), `UriService.register`, `NoticeService.show`, `JournalUriHandler.initialize`, `journalUriModule`, action `"journals"` — used identically across tasks.
