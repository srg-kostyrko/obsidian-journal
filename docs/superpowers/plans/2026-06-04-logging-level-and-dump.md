# Logging level control and dump-to-note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global log-level threshold (chosen in settings) that gates every log record, plus a button that writes the recently recorded logs to a new timestamped note in the vault.

**Architecture:** The low-level `infrastructure/logger` gains a `LogLevelGate` (a threshold holder the `Logger` consults before fanning out to sinks) and a `BufferSink` (a 1000-record ring buffer). A new thin `src/logging` feature owns the settings slice, a dashboard-block UI, a bridge that pushes the slice's level into the gate, and a `DumpLogsFlow` that writes the buffer to a note. Dependency direction stays clean: the logger defines the ports; the feature wires them.

**Tech Stack:** TypeScript, Vue 3 SFCs, valibot (settings schema), a custom DI container (`@/infrastructure/di`), the project's `Result`/`AsyncResult` (`@/infrastructure/result`), Vitest, paraglide i18n (`@/i18n`).

**Spec:** `docs/superpowers/specs/2026-06-04-logging-level-and-dump-design.md`

---

## File Structure

**Created (logger infrastructure):**

- `src/infrastructure/logger/log-level-gate.ts` — threshold holder + token
- `src/infrastructure/logger/log-level-gate.test.ts`
- `src/infrastructure/logger/buffer-sink.ts` — ring buffer sink + token
- `src/infrastructure/logger/buffer-sink.test.ts`

**Modified (logger infrastructure):**

- `src/infrastructure/logger/logger.ts` — consult gate in `#emit`
- `src/infrastructure/logger/logger.test.ts` — add filtering tests
- `src/infrastructure/logger/factory.ts` — inject gate, pass to `Logger`
- `src/infrastructure/logger/factory.test.ts` — register gate in test container
- `src/infrastructure/logger/module.ts` — register gate + buffer sink (aliased)
- `src/infrastructure/logger/testing.ts` — register gate in testing module
- `src/infrastructure/logger/index.ts` — export new public symbols

**Created (logging feature):**

- `src/logging/settings/slice.ts` — `logging` slice
- `src/logging/settings/bridge.ts` — `LoggingSettingsBridge`
- `src/logging/settings/bridge.test.ts`
- `src/logging/settings/ui/LoggingBlock.vue` — dashboard block
- `src/logging/flows/format-dump.ts` — pure record-to-markdown formatter
- `src/logging/flows/format-dump.test.ts`
- `src/logging/flows/dump-logs.flow.ts` — `DumpLogsFlow`
- `src/logging/flows/dump-logs.flow.test.ts`
- `src/logging/module.ts` — feature wiring
- `src/logging/index.ts` — barrel (exports `loggingModule`)

**Modified (app + i18n):**

- `messages/en.json` — `logging_*` messages
- `src/main.ts` — add `loggingModule`

**No `errors.ts`:** `DumpLogsFlow` propagates the host's existing `NoteCreateError`/`NoteAlreadyExistsError`; wrapping them would be a pass-through abstraction, so none is added.

**No component test for `LoggingBlock.vue`:** it is pure wiring (dropdown↔slice, button→flow); per project convention wiring is not tested. Its behavior is covered indirectly by the bridge test (level→gate) and flow test (dump).

**Task order note:** the i18n messages (Task 5) are created before the flow (Task 6) and the Vue block (Task 9) that call them, so every task type-checks and its tests run cleanly in isolation.

---

### Task 1: `LogLevelGate`

**Files:**

- Create: `src/infrastructure/logger/log-level-gate.ts`
- Test: `src/infrastructure/logger/log-level-gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/infrastructure/logger/log-level-gate.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { LogLevelGate } from "./log-level-gate";

describe("LogLevelGate", () => {
  it("enables a level equal to the threshold", () => {
    expect(new LogLevelGate("warn").isEnabled("warn")).toBe(true);
  });

  it("enables a level above the threshold", () => {
    expect(new LogLevelGate("warn").isEnabled("error")).toBe(true);
  });

  it("disables a level below the threshold", () => {
    expect(new LogLevelGate("warn").isEnabled("info")).toBe(false);
  });

  it("defaults to a warn threshold", () => {
    expect(new LogLevelGate().isEnabled("info")).toBe(false);
  });

  it("applies a new threshold after setThreshold", () => {
    const gate = new LogLevelGate("warn");
    gate.setThreshold("debug");
    expect(gate.isEnabled("debug")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- log-level-gate`
Expected: FAIL — cannot find module `./log-level-gate`.

- [ ] **Step 3: Write minimal implementation**

Create `src/infrastructure/logger/log-level-gate.ts`:

```typescript
import { createToken } from "@/infrastructure/di";

import type { LogLevel } from "./types";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class LogLevelGate {
  #threshold: LogLevel;

  constructor(threshold: LogLevel = "warn") {
    this.#threshold = threshold;
  }

  setThreshold(level: LogLevel): void {
    this.#threshold = level;
  }

  isEnabled(level: LogLevel): boolean {
    return RANK[level] >= RANK[this.#threshold];
  }
}

export const LogLevelGateToken = createToken<LogLevelGate>("LogLevelGate");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- log-level-gate`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/logger/log-level-gate.ts src/infrastructure/logger/log-level-gate.test.ts
git commit -m "feat(logger): add LogLevelGate threshold"
```

---

### Task 2: `BufferSink`

**Files:**

- Create: `src/infrastructure/logger/buffer-sink.ts`
- Test: `src/infrastructure/logger/buffer-sink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/infrastructure/logger/buffer-sink.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { BufferSink } from "./buffer-sink";

import type { LogRecord } from "./types";

function record(message: string): LogRecord {
  return { timestamp: 0, level: "info", name: "t", message };
}

describe("BufferSink", () => {
  it("retains written records in order", () => {
    const sink = new BufferSink();
    sink.write(record("a"));
    sink.write(record("b"));
    expect(sink.snapshot().map((r) => r.message)).toEqual(["a", "b"]);
  });

  it("evicts the oldest record once capacity is exceeded", () => {
    const sink = new BufferSink();
    for (let i = 0; i < BufferSink.capacity + 1; i++) sink.write(record(String(i)));
    const snap = sink.snapshot();
    expect(snap).toHaveLength(BufferSink.capacity);
    expect(snap[0]?.message).toBe("1");
  });

  it("returns a snapshot detached from later writes", () => {
    const sink = new BufferSink();
    sink.write(record("a"));
    const snap = sink.snapshot();
    sink.write(record("b"));
    expect(snap).toHaveLength(1);
  });

  it("empties the buffer on clear", () => {
    const sink = new BufferSink();
    sink.write(record("a"));
    sink.clear();
    expect(sink.snapshot()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- buffer-sink`
Expected: FAIL — cannot find module `./buffer-sink`.

- [ ] **Step 3: Write minimal implementation**

Create `src/infrastructure/logger/buffer-sink.ts`:

```typescript
import { createToken } from "@/infrastructure/di";

import type { LogRecord, LogSink } from "./types";

export class BufferSink implements LogSink {
  static readonly capacity = 1000;

  readonly #records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.#records.push(record);
    if (this.#records.length > BufferSink.capacity) this.#records.shift();
  }

  snapshot(): readonly LogRecord[] {
    return [...this.#records];
  }

  clear(): void {
    this.#records.length = 0;
  }
}

export const BufferSinkToken = createToken<BufferSink>("BufferSink");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- buffer-sink`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/logger/buffer-sink.ts src/infrastructure/logger/buffer-sink.test.ts
git commit -m "feat(logger): add BufferSink ring buffer"
```

---

### Task 3: Logger consults the gate

**Files:**

- Modify: `src/infrastructure/logger/logger.ts`
- Test: `src/infrastructure/logger/logger.test.ts` (add a describe block)

The `Logger` gains an optional third constructor argument: the gate. It defaults to an allow-all (`"debug"`) gate so the existing direct-construction tests (which emit `info`/`debug`) keep passing unchanged; production always constructs loggers through `LoggerFactory`, which passes the real gate (Task 4).

- [ ] **Step 1: Write the failing tests**

In `src/infrastructure/logger/logger.test.ts`, add this import beneath the existing imports:

```typescript
import { LogLevelGate } from "./log-level-gate";
```

Then add this describe block inside the top-level `describe("Logger", ...)`:

```typescript
describe("level filtering", () => {
  it("drops a record below the gate threshold before any sink sees it", () => {
    new Logger("svc", [sink], new LogLevelGate("warn")).info("hi");
    expect(sink.records).toHaveLength(0);
  });

  it("passes a record at or above the gate threshold to the sinks", () => {
    new Logger("svc", [sink], new LogLevelGate("warn")).error("boom");
    expect(sink.records).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- logger.test`
Expected: FAIL — the warn-threshold `info` record is not dropped (got length 1, expected 0).

- [ ] **Step 3: Write minimal implementation**

Replace the contents of `src/infrastructure/logger/logger.ts` with:

```typescript
import { LogLevelGate } from "./log-level-gate";

import type { Fields, LogLevel, LogRecord, LogSink } from "./types";

export class Logger {
  readonly #sinks: readonly LogSink[];
  readonly #gate: LogLevelGate;

  constructor(
    readonly name: string,
    sinks: readonly LogSink[],
    gate: LogLevelGate = new LogLevelGate("debug"),
  ) {
    this.#sinks = sinks;
    this.#gate = gate;
  }

  debug(message: string, fields?: Fields): void {
    this.#emit("debug", message, fields);
  }

  info(message: string, fields?: Fields): void {
    this.#emit("info", message, fields);
  }

  warn(message: string, fields?: Fields): void {
    this.#emit("warn", message, fields);
  }

  error(message: string, fields?: Fields): void {
    this.#emit("error", message, fields);
  }

  child(name: string): Logger {
    const composed = this.name === "" ? name : `${this.name}.${name}`;
    return new Logger(composed, this.#sinks, this.#gate);
  }

  #emit(level: LogLevel, message: string, fields?: Fields): void {
    if (!this.#gate.isEnabled(level)) return;
    const record: LogRecord = {
      timestamp: Date.now(),
      level,
      name: this.name,
      message,
      fields,
    };
    for (const sink of this.#sinks) {
      try {
        sink.write(record);
      } catch {
        // A throwing sink must not break the caller and must not block sibling sinks.
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- logger.test`
Expected: PASS (existing tests + 2 new filtering tests).

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/logger/logger.ts src/infrastructure/logger/logger.test.ts
git commit -m "feat(logger): filter records below the gate threshold"
```

---

### Task 4: Wire the gate + buffer into the factory and module

**Files:**

- Modify: `src/infrastructure/logger/factory.ts`
- Modify: `src/infrastructure/logger/factory.test.ts`
- Modify: `src/infrastructure/logger/module.ts`
- Modify: `src/infrastructure/logger/testing.ts`
- Modify: `src/infrastructure/logger/index.ts`

`LoggerFactory` now injects the gate and passes it to every `Logger`. The `BufferSink` is registered **once** under `BufferSinkToken`, then aliased into `LogSinkMultiToken` via a factory so the logger and the dump flow share one instance (registering the class under both tokens with `useClass` would create two independent buffers, since each registration owns its own caching slot).

- [ ] **Step 1: Update `LoggerFactory` to inject and pass the gate**

Replace the contents of `src/infrastructure/logger/factory.ts` with:

```typescript
import { createToken, inject } from "@/infrastructure/di";

import { Logger } from "./logger";
import { LogLevelGateToken } from "./log-level-gate";
import { LogSinkMultiToken } from "./types";

export class LoggerFactory {
  readonly #sinks = inject(LogSinkMultiToken);
  readonly #gate = inject(LogLevelGateToken);

  named(name: string): Logger {
    return new Logger(name, this.#sinks, this.#gate);
  }
}

export const LoggerFactoryToken = createToken<LoggerFactory>("LoggerFactory");
```

- [ ] **Step 2: Fix `factory.test.ts` to register the gate**

`LoggerFactory` now resolves `LogLevelGateToken`, so the hand-built container in this test must register it. Use an allow-all (`"debug"`) gate so the `info("hi")` assertion still records. Replace the contents of `src/infrastructure/logger/factory.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
import { MemorySink } from "./testing";
import { LogSinkMultiToken } from "./types";

describe("LoggerFactory", () => {
  it("creates a Logger with the given name that emits to the injected sinks", () => {
    const sink = new MemorySink();
    const c = new Container();
    c.register(LogSinkMultiToken).useValue(sink);
    c.register(LogLevelGateToken).useValue(new LogLevelGate("debug"));
    c.register(LoggerFactoryToken).useClass(LoggerFactory);

    c.resolve(LoggerFactoryToken).named("svc").info("hi");

    expect(sink.records[0]?.name).toBe("svc");
  });
});
```

- [ ] **Step 3: Update `LoggerModule`**

Replace the contents of `src/infrastructure/logger/module.ts` with:

```typescript
import { inject, type Module } from "@/infrastructure/di";

import { BufferSink, BufferSinkToken } from "./buffer-sink";
import { ConsoleSink } from "./console-sink";
import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
import { LogSinkMultiToken } from "./types";

export const LoggerModule: Module = {
  register(c) {
    c.register(LogLevelGateToken).useClass(LogLevelGate);
    c.register(BufferSinkToken).useClass(BufferSink);
    c.register(LogSinkMultiToken).useFactory(() => inject(BufferSinkToken));
    c.register(LogSinkMultiToken).useClass(ConsoleSink);
    c.register(LoggerFactoryToken).useClass(LoggerFactory);
  },
};
```

- [ ] **Step 4: Update the logger testing module to register the gate**

`createLoggerTestingModule` builds a container whose `LoggerFactory` now needs the gate. Register an allow-all (`"debug"`) gate so tests capture every level into the `MemorySink`. Replace the contents of `src/infrastructure/logger/testing.ts` with:

```typescript
import type { Module } from "@/infrastructure/di";

import { LoggerFactory, LoggerFactoryToken } from "./factory";
import { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
import { LogSinkMultiToken, type LogRecord, type LogSink } from "./types";

export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];

  write(record: LogRecord): void {
    this.records.push(record);
  }
}

export function createLoggerTestingModule(): { module: Module; sink: MemorySink } {
  const sink = new MemorySink();
  const module: Module = {
    register(c) {
      c.register(LogSinkMultiToken).useValue(sink);
      c.register(LogLevelGateToken).useValue(new LogLevelGate("debug"));
      c.register(LoggerFactoryToken).useClass(LoggerFactory);
    },
  };
  return { module, sink };
}
```

- [ ] **Step 5: Export the new public symbols from the logger barrel**

Replace the contents of `src/infrastructure/logger/index.ts` with:

```typescript
export { Logger } from "./logger";
export { LoggerFactory, LoggerFactoryToken } from "./factory";
export { LoggerModule } from "./module";
export { LogLevelGate, LogLevelGateToken } from "./log-level-gate";
export { BufferSink, BufferSinkToken } from "./buffer-sink";
export { LogSinkMultiToken, type Fields, type LogLevel, type LogRecord, type LogSink } from "./types";
```

- [ ] **Step 6: Run the logger suite and type check**

Run: `npm run test -- src/infrastructure/logger`
Expected: PASS (all logger tests).
Run: `npm run check:types`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/logger/factory.ts src/infrastructure/logger/factory.test.ts src/infrastructure/logger/module.ts src/infrastructure/logger/testing.ts src/infrastructure/logger/index.ts
git commit -m "feat(logger): wire gate and buffer sink into the module"
```

---

### Task 5: i18n messages

**Files:**

- Modify: `messages/en.json`
- Regenerated: `src/i18n/paraglide/` (via the compile script)

Created before the flow and the Vue block that reference these messages, so those tasks type-check and run in isolation.

- [ ] **Step 1: Add the messages**

In `messages/en.json`, add these entries among the existing keys (the file is alphabetically ordered; place them where `logging_*` sorts):

```json
  "logging_dump_button": "Dump logs to note",
  "logging_dump_desc": "Write the recently recorded log messages to a new note in your vault.",
  "logging_dump_empty": "No log messages have been recorded yet.",
  "logging_dump_failed": "Failed to write the log note.",
  "logging_dump_succeeded": "Logs written to {path}",
  "logging_dump_title": "Export logs",
  "logging_level_debug": "Debug",
  "logging_level_desc": "Only log messages at or above this level are printed to the console and kept for export.",
  "logging_level_error": "Error",
  "logging_level_info": "Info",
  "logging_level_title": "Log level",
  "logging_level_warn": "Warning",
  "logging_section_title": "Logging",
```

- [ ] **Step 2: Compile the messages**

Run: `npm run compile:i18n`
Expected: regenerates `src/i18n/paraglide/` so `m.logging_*` exist as callable functions. No errors.

- [ ] **Step 3: Type check**

Run: `npm run check:types`
Expected: PASS (the generated `m.logging_*` now exist; nothing references them yet, so no new errors).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json src/i18n/paraglide
git commit -m "feat(logging): add logging i18n messages"
```

---

### Task 6: `formatLogDump` markdown formatter

**Files:**

- Create: `src/logging/flows/format-dump.ts`
- Test: `src/logging/flows/format-dump.test.ts`

A pure function turning records into the fenced-block markdown body. Kept separate from the flow so it is testable without DI.

- [ ] **Step 1: Write the failing test**

Create `src/logging/flows/format-dump.test.ts`:

````typescript
import { describe, expect, it } from "vitest";

import type { LogRecord } from "@/infrastructure/logger";

import { formatLogDump } from "./format-dump";

const at = Date.parse("2026-06-04T12:30:00Z");

describe("formatLogDump", () => {
  it("renders a record as one line inside a fenced block", () => {
    const record: LogRecord = { timestamp: at, level: "warn", name: "settings", message: "saved" };
    expect(formatLogDump([record])).toBe(
      ["```", "2026-06-04T12:30:00.000Z [warn] [journals:settings] saved", "```", ""].join("\n"),
    );
  });

  it("tags a root-logger record without a sub-name", () => {
    const record: LogRecord = { timestamp: at, level: "info", name: "", message: "hi" };
    expect(formatLogDump([record])).toContain("[journals] hi");
  });

  it("appends serialized fields when present", () => {
    const record: LogRecord = { timestamp: at, level: "info", name: "", message: "hi", fields: { a: 1 } };
    expect(formatLogDump([record])).toContain('hi {"a":1}');
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- format-dump`
Expected: FAIL — cannot find module `./format-dump`.

- [ ] **Step 3: Write minimal implementation**

Create `src/logging/flows/format-dump.ts`:

````typescript
import type { LogRecord } from "@/infrastructure/logger";

function line(record: LogRecord): string {
  const time = new Date(record.timestamp).toISOString();
  const name = record.name === "" ? "journals" : `journals:${record.name}`;
  const fields = record.fields === undefined ? "" : ` ${JSON.stringify(record.fields)}`;
  return `${time} [${record.level}] [${name}] ${record.message}${fields}`;
}

export function formatLogDump(records: readonly LogRecord[]): string {
  return ["```", ...records.map(line), "```", ""].join("\n");
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- format-dump`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/logging/flows/format-dump.ts src/logging/flows/format-dump.test.ts
git commit -m "feat(logging): add log-dump markdown formatter"
```

---

### Task 7: `DumpLogsFlow`

**Files:**

- Create: `src/logging/flows/dump-logs.flow.ts`
- Test: `src/logging/flows/dump-logs.flow.test.ts`

The flow reads the buffer; on an empty buffer it shows a "nothing to dump" notice and returns without writing. Otherwise it creates a timestamped note in the vault root, shows a success notice naming it, and on a write failure shows a failure notice and propagates the host error.

- [ ] **Step 1: Write the failing test**

Create `src/logging/flows/dump-logs.flow.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { NoticeService, NotesService } from "@/infrastructure/host";
import { NoteCreateError } from "@/infrastructure/host";
import type { Note, VaultPath } from "@/infrastructure/host";
import { BufferSink, BufferSinkToken } from "@/infrastructure/logger";
import type { LogRecord } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { DumpLogsFlow } from "./dump-logs.flow";

const record: LogRecord = { timestamp: Date.parse("2026-06-04T12:30:00Z"), level: "warn", name: "x", message: "hi" };

function build(records: readonly LogRecord[]) {
  const buffer = new BufferSink();
  for (const r of records) buffer.write(r);
  const note = (path: VaultPath): Note => ({ path, basename: "", folder: "" as VaultPath });
  const notes = { create: vi.fn((path: VaultPath) => AsyncResult.ok(note(path))) };
  const notices = { show: vi.fn() };
  const c = new Container();
  c.register(BufferSinkToken).useValue(buffer);
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(NoticeService).useValue(notices as unknown as NoticeService);
  c.register(DumpLogsFlow).useClass(DumpLogsFlow);
  return { flow: c.resolve(DumpLogsFlow), notes, notices };
}

const NAME = /^journal-log-\d{8}-\d{6}\.md$/;

describe("DumpLogsFlow", () => {
  describe("with buffered records", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-04T12:30:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates a timestamped note containing the buffered records", async () => {
      const { flow, notes } = build([record]);
      const result = await flow.execute();
      expectOk(result);
      expect(notes.create).toHaveBeenCalledWith(expect.stringMatching(NAME), expect.stringContaining("hi"));
    });

    it("shows a success notice naming the created note", async () => {
      const { flow, notices } = build([record]);
      await flow.execute();
      expect(notices.show).toHaveBeenCalledWith(expect.stringMatching(/journal-log-\d{8}-\d{6}\.md/));
    });
  });

  describe("with an empty buffer", () => {
    it("creates no note", async () => {
      const { flow, notes } = build([]);
      const result = await flow.execute();
      expectOk(result);
      expect(notes.create).not.toHaveBeenCalled();
    });

    it("shows a notice", async () => {
      const { flow, notices } = build([]);
      await flow.execute();
      expect(notices.show).toHaveBeenCalledOnce();
    });
  });

  describe("when the note cannot be written", () => {
    it("propagates the create error", async () => {
      const { flow, notes } = build([record]);
      notes.create.mockReturnValueOnce(
        AsyncResult.err(new NoteCreateError("journal-log.md" as VaultPath, new Error("disk full"))),
      );
      const result = await flow.execute();
      expectErr(result);
    });

    it("shows a failure notice", async () => {
      const { flow, notes, notices } = build([record]);
      notes.create.mockReturnValueOnce(
        AsyncResult.err(new NoteCreateError("journal-log.md" as VaultPath, new Error("disk full"))),
      );
      await flow.execute();
      expect(notices.show).toHaveBeenCalledWith(expect.stringContaining("Failed"));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- dump-logs.flow`
Expected: FAIL — cannot find module `./dump-logs.flow`.

- [ ] **Step 3: Write minimal implementation**

Create `src/logging/flows/dump-logs.flow.ts`:

```typescript
import { moment } from "obsidian";

import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { NoticeService, NotesService } from "@/infrastructure/host";
import type { NoteAlreadyExistsError, NoteCreateError, VaultPath } from "@/infrastructure/host";
import { BufferSinkToken } from "@/infrastructure/logger";
import { attempt, type AsyncResult } from "@/infrastructure/result";

import { formatLogDump } from "./format-dump";

type DumpLogsError = NoteCreateError | NoteAlreadyExistsError;

export class DumpLogsFlow implements Flow<void, void, DumpLogsError> {
  readonly #buffer = inject(BufferSinkToken);
  readonly #notes = inject(NotesService);
  readonly #notices = inject(NoticeService);

  execute(): AsyncResult<void, DumpLogsError> {
    return attempt.in(this, async function* (this: DumpLogsFlow) {
      const records = this.#buffer.snapshot();
      if (records.length === 0) {
        this.#notices.show(m.logging_dump_empty());
        return;
      }
      const path = `journal-log-${moment().format("YYYYMMDD-HHmmss")}.md` as VaultPath;
      const note = yield* this.#notes
        .create(path, formatLogDump(records))
        .tapErr(() => this.#notices.show(m.logging_dump_failed()));
      this.#notices.show(m.logging_dump_succeeded({ path: note.path }));
      return;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- dump-logs.flow`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/logging/flows/dump-logs.flow.ts src/logging/flows/dump-logs.flow.test.ts
git commit -m "feat(logging): add DumpLogsFlow"
```

---

### Task 8: `logging` settings slice

**Files:**

- Create: `src/logging/settings/slice.ts`

No test: a slice is configuration (schema + defaults); per project convention config wiring is not unit-tested.

- [ ] **Step 1: Create the slice**

Create `src/logging/settings/slice.ts`:

```typescript
import * as v from "valibot";

import { defineSlice } from "@/settings";

export const loggingSliceSchema = v.object({
  level: v.picklist(["debug", "info", "warn", "error"]),
});

export type LoggingSliceState = v.InferOutput<typeof loggingSliceSchema>;

export const loggingSlice = defineSlice<"logging", typeof loggingSliceSchema>("logging", loggingSliceSchema, {
  level: "warn",
});
```

- [ ] **Step 2: Type check**

Run: `npm run check:types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/logging/settings/slice.ts
git commit -m "feat(logging): add logging settings slice"
```

---

### Task 9: `LoggingSettingsBridge`

**Files:**

- Create: `src/logging/settings/bridge.ts`
- Test: `src/logging/settings/bridge.test.ts`

The bridge watches the slice and pushes its level into the gate — both on creation and reactively on change.

- [ ] **Step 1: Write the failing test**

Create `src/logging/settings/bridge.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { nextTick, reactive } from "vue";

import { Container } from "@/infrastructure/di";
import { LogLevelGate, LogLevelGateToken } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";

import { LoggingSettingsBridge } from "./bridge";

import type { LoggingSliceState } from "./slice";

function build(initial: LoggingSliceState["level"]) {
  const state = reactive<LoggingSliceState>({ level: initial });
  const gate = new LogLevelGate("warn");
  const settings = {
    getSlice: () => ({
      get state() {
        return state;
      },
    }),
  };
  const c = new Container();
  c.register(LogLevelGateToken).useValue(gate);
  c.register(SettingsService).useValue(settings as unknown as SettingsService);
  c.register(LoggingSettingsBridge).useClass(LoggingSettingsBridge);
  return { bridge: c.resolve(LoggingSettingsBridge), gate, state };
}

describe("LoggingSettingsBridge", () => {
  it("applies the slice's level to the gate on creation", () => {
    const { gate } = build("debug");
    expect(gate.isEnabled("debug")).toBe(true);
  });

  it("re-applies the gate when the slice level changes", async () => {
    const { gate, state } = build("warn");
    expect(gate.isEnabled("info")).toBe(false);
    state.level = "debug";
    await nextTick();
    expect(gate.isEnabled("info")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- logging/settings/bridge`
Expected: FAIL — cannot find module `./bridge`.

- [ ] **Step 3: Write minimal implementation**

Create `src/logging/settings/bridge.ts`:

```typescript
import { watchEffect, type WatchStopHandle } from "vue";

import { inject } from "@/infrastructure/di";
import { LogLevelGateToken } from "@/infrastructure/logger";
import { SettingsService } from "@/settings";

import { loggingSlice } from "./slice";

export class LoggingSettingsBridge {
  readonly #gate = inject(LogLevelGateToken);
  readonly #settings = inject(SettingsService);
  readonly #stop: WatchStopHandle;

  constructor() {
    const slice = this.#settings.getSlice(loggingSlice);
    this.#stop = watchEffect(() => {
      const state = slice.state;
      if (state === undefined) return;
      this.#gate.setThreshold(state.level);
    });
  }

  [Symbol.dispose](): void {
    this.#stop();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- logging/settings/bridge`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/logging/settings/bridge.ts src/logging/settings/bridge.test.ts
git commit -m "feat(logging): add settings bridge driving the gate"
```

---

### Task 10: `LoggingBlock.vue` dashboard block

**Files:**

- Create: `src/logging/settings/ui/LoggingBlock.vue`

A collapsible settings section: a level dropdown bound to the slice (reassigning `slice.state` so the settings auto-save fires, matching the calendar block) and a button that invokes `DumpLogsFlow`.

- [ ] **Step 1: Create the component**

Create `src/logging/settings/ui/LoggingBlock.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DumpLogsFlow } from "../../flows/dump-logs.flow";
import { loggingSlice, type LoggingSliceState } from "../slice";

const settings = useService(SettingsService);
const flows = useService(Flows);
const slice = settings.getSlice(loggingSlice);
const expanded = ref(false);

const level = computed<string>({
  get: () => slice.state.level,
  set: (value) => {
    slice.state = { ...slice.state, level: value as LoggingSliceState["level"] };
  },
});

function dump(): void {
  void flows.invoke(DumpLogsFlow);
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="section-heading">
        <UiIcon name="scroll-text" />
        <span class="section-title">{{ m.logging_section_title() }}</span>
      </span>
    </template>
    <UiSettingRow :name="m.logging_level_title()">
      <template #description>{{ m.logging_level_desc() }}</template>
      <UiDropdown v-model="level">
        <option value="debug">{{ m.logging_level_debug() }}</option>
        <option value="info">{{ m.logging_level_info() }}</option>
        <option value="warn">{{ m.logging_level_warn() }}</option>
        <option value="error">{{ m.logging_level_error() }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow :name="m.logging_dump_title()">
      <template #description>{{ m.logging_dump_desc() }}</template>
      <UiButton @click="dump">{{ m.logging_dump_button() }}</UiButton>
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}
.section-title {
  font-weight: var(--font-semibold);
}
</style>
```

- [ ] **Step 2: Type check**

Run: `npm run check:types`
Expected: PASS — `slice.state.level`, the `level` computed, and `flows.invoke(DumpLogsFlow)` all type-check.

- [ ] **Step 3: Commit**

```bash
git add src/logging/settings/ui/LoggingBlock.vue
git commit -m "feat(logging): add logging settings dashboard block"
```

---

### Task 11: Module wiring and final quality gate

**Files:**

- Create: `src/logging/module.ts`
- Create: `src/logging/index.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create the feature module**

Create `src/logging/module.ts`:

```typescript
import type { Module } from "@/infrastructure/di";
import { DashboardBlockToken, SliceDefinitionToken, defineDashboardBlock } from "@/settings";

import { DumpLogsFlow } from "./flows/dump-logs.flow";
import { LoggingSettingsBridge } from "./settings/bridge";
import { loggingSlice } from "./settings/slice";
import LoggingBlock from "./settings/ui/LoggingBlock.vue";

export const loggingModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(loggingSlice);
    c.register(DashboardBlockToken).useValue(
      defineDashboardBlock({ key: "logging", component: LoggingBlock, order: 100 }),
    );
    c.register(DumpLogsFlow).useClass(DumpLogsFlow);
    c.register(LoggingSettingsBridge).useClass(LoggingSettingsBridge).eager();
  },
};
```

- [ ] **Step 2: Create the barrel**

Create `src/logging/index.ts`:

```typescript
export { loggingModule } from "./module";
```

- [ ] **Step 3: Wire the module into `main.ts`**

In `src/main.ts`, add this import alongside the other feature imports (place it after the `@/journals/...` imports and before `import { notesCalendarModule } from "@/notes-calendar";`):

```typescript
import { loggingModule } from "@/logging";
```

Then register it in `onload()`. Add this line immediately after `container.addModule(startupModule);` (the last `addModule` call before the `SettingsService` initialization):

```typescript
container.addModule(loggingModule);
```

The bridge is `.eager()`, so it resolves during `container.autoLoad()` — which runs after `SettingsService.initialize()`, so the slice is hydrated by the time the bridge reads it and narrows the gate from its `warn` boot default to the persisted level.

- [ ] **Step 4: Run the full quality gate**

Run: `npm run test`
Expected: PASS (all suites, including the new logger/logging tests).

Run: `npm run check:types`
Expected: PASS.

Run: `npm run check:lint`
Expected: PASS — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/logging/module.ts src/logging/index.ts src/main.ts
git commit -m "feat(logging): wire logging feature into the app"
```

---

## Manual verification (after all tasks)

Build and load in Obsidian (or your dev vault):

1. Open Settings → the plugin's settings dashboard → the **Logging** section appears.
2. The **Log level** dropdown defaults to **Warning**. Set it to **Debug**.
3. Trigger some plugin activity that logs (e.g. open/create a journal entry).
4. Click **Dump logs to note** → a new `journal-log-<timestamp>.md` appears in the vault root containing a fenced block of records; a notice confirms the path.
5. Set the level back to **Warning**, reload Obsidian, and confirm the level persisted (dropdown shows **Warning**) and the console is quiet again.
6. With a fresh reload and no activity, click **Dump logs to note** → a "no log messages recorded" notice appears and no note is created.

```

```
