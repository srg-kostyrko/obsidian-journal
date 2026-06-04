# Logging level control and dump-to-note

## Problem

The plugin's logger fans every record out to every sink unconditionally — there
is no way to control how much it logs. In practice this means the only sink, the
browser console, is either silent or receives everything, with nothing in
between and no user control.

When a user hits a problem and is asked for logs, there is also no way to get
them out of the console and into something shareable. They would have to open
devtools, scroll the console, and copy by hand.

Two capabilities close this gap: a setting that controls which log levels are
processed at all, and a button that writes the recently recorded logs to a note
in the vault.

## Scope

In scope:

- A single global log-level threshold, chosen in settings, that gates every log
  record before it reaches any sink (console included).
- An in-memory ring buffer that retains the most recent processed records.
- A button that writes the current buffer to a new, timestamped note in the
  vault root.

Out of scope for this iteration: per-sink or per-logger thresholds, continuous
streaming of logs to a note, persisting the buffer across plugin reloads, and a
UI for browsing or clearing the buffer. The buffer is cleared only by an Obsidian
reload.

## Behavior

### Level threshold

A new "Logging" settings section offers a single level selector with the four
levels in increasing severity: debug, info, warn, error. The chosen level is the
threshold: a record is processed only when its level is at or above the
threshold. A record below the threshold is dropped before any sink sees it — it
is neither printed to the console nor kept for the dump.

The default threshold is **warn**, so a fresh install keeps the console quiet and
surfaces only warnings and errors. Lowering it to debug captures everything for
troubleshooting.

Changing the level takes effect immediately for subsequent records; it does not
retroactively add or remove anything already in the buffer.

### Recorded buffer

Every processed record (one that passes the threshold) is also retained in an
in-memory ring buffer that holds the most recent **1000** records. Once full, the
oldest record is dropped as each new one arrives. The buffer starts empty on each
plugin load and is not persisted.

### Dump to note

The Logging section has a "Dump logs to note" button. Pressing it writes every
record currently in the buffer to a new note created in the vault root, named
with the moment it was created — `journal-log-<YYYYMMDD-HHmmss>.md`. Each press
creates a distinct note; nothing is overwritten or appended.

Each record is rendered as one line carrying its timestamp, level, logger name,
message, and fields (when present), inside a fenced block so note rendering does
not reinterpret the content.

On success a notice confirms the note was written and names it. Pressing the
button with an empty buffer writes no note and shows a "nothing to dump" notice.

## Errors

- If the note cannot be created (vault write failure), a notice reports the
  failure and no note is left behind. The buffer is unaffected.

## Acceptance scenarios

- With the threshold at warn, a warn record and an error record are processed; a
  debug record and an info record are dropped.
- Lowering the threshold to debug causes a subsequent debug record to be
  processed; a debug record emitted before the change is not retroactively added.
- The buffer retains processed records in order; after more than 1000 records the
  oldest are gone and the newest 1000 remain.
- A dropped (below-threshold) record never appears in the buffer or a dump.
- Pressing "Dump logs to note" writes a note in the vault root named
  `journal-log-<timestamp>.md` containing the buffered records, and a confirming
  notice names it.
- Two presses produce two distinct notes; neither overwrites the other.
- Pressing the button with an empty buffer writes no note and shows a "nothing to
  dump" notice.
- A vault write failure surfaces a notice and leaves no note.

## Design notes

The work splits into low-level logger infrastructure (the gate and the buffer
sink, which the `Logger` consults) and a thin feature that owns the settings, the
UI, the bridge, and the dump flow. The dependency direction stays clean:
`infrastructure/logger` defines the ports; the feature wires settings into them.
This mirrors the existing calendar/commands bridge pattern.

### `src/infrastructure/logger` changes

- **`LogLevelGate`** (new, singleton token). Holds the current threshold and
  answers `isEnabled(level): boolean` using numeric ranks
  (`debug` < `info` < `warn` < `error`). `setThreshold(level)` mutates it. The
  boot default is `warn` — the same quiet level the slice defaults to — so there
  is no allow-all startup phase; below-warn records emitted before settings load
  are dropped. The settings bridge then applies the user's persisted level.
- **`Logger`**. `#emit` early-returns when `!gate.isEnabled(level)`, before the
  sink fan-out. The gate is injected through `LoggerFactory`, which constructs
  loggers as `new Logger(name, sinks, gate)`. `child()` passes the gate along.
- **`BufferSink`** (new). A ring buffer implementing `LogSink`; fixed capacity
  1000, oldest evicted on overflow. Exposes `snapshot(): readonly LogRecord[]`
  and `clear()`. It has its own `BufferSinkToken` so the dump flow can inject the
  exact instance.
- **`LoggerModule`** wiring. Register the gate and the buffer sink. The buffer is
  registered **once** as a class under `BufferSinkToken`, then **aliased** into
  the sink list so the logger and the dump flow share one instance:

  ```ts
  c.register(BufferSinkToken).useClass(BufferSink);
  c.register(LogSinkMultiToken).useFactory(() => inject(BufferSinkToken));
  c.register(LogSinkMultiToken).useClass(ConsoleSink);
  ```

  Registering `BufferSink` under both tokens with `useClass` would create two
  instances — each `StoredEntry` owns its own caching slot — so the dump flow
  would read an empty buffer while the logger filled the other. The factory alias
  resolves through `BufferSinkToken`'s slot and yields the single instance.

### `src/logging` feature (new)

A subfolder with its own `module.ts`, following the canonical feature layout.

- **`settings/slice.ts`** — a `logging` slice. Schema
  `{ level: v.picklist(["debug", "info", "warn", "error"]) }`, default
  `{ level: "warn" }`. The level type is inferred from the schema.
- **`settings/bridge.ts`** — `LoggingSettingsBridge`, registered eager. A
  `watchEffect` reads the slice and calls `gate.setThreshold(state.level)`;
  `Symbol.dispose` stops the watch. This is the only place that applies the
  persisted level to the gate after its `warn` boot default.
- **`settings/ui/LoggingBlock.vue`** — a dashboard block (registered via
  `DashboardBlockToken`). A `UiSettingRow` + `UiDropdown` bound to the slice's
  level, and a `UiSettingRow` + `UiButton` ("Dump logs to note") that invokes the
  dump flow via `useService`. Level labels and the button/notice text are added as
  `m.logging_*` paraglide messages in `messages/en.json`.
- **`flows/dump-logs.flow.ts`** — `DumpLogsFlow`, composed as an `attempt.in`
  do-notation block. Reads `BufferSink.snapshot()`; when it is empty, shows the
  "nothing to dump" notice and returns without creating a note. Otherwise formats
  the markdown body
  (fenced block; one line per record:
  `<ISO timestamp> [<level>] [<name>] <message> <fields-as-JSON?>`), derives the
  filename `journal-log-<YYYYMMDD-HHmmss>.md` from the current moment, creates the
  note in the vault root via `NotesService.create`, and shows a confirming notice
  via `NoticeService`. A create failure becomes the flow's error branch and a
  failure notice. Failure types live in `errors.ts`.
- **`module.ts`** — registers the slice, the bridge (eager), the dashboard block,
  and the flow. Added to `main.ts`'s module list.

### Tests

Colocated `*.test.ts`:

- `LogLevelGate`: rank comparison and threshold filtering at each boundary.
- `Logger`: a below-threshold record reaches no sink; an at/above record reaches
  every sink (black-box via a recording fake sink).
- `BufferSink`: retains order, evicts oldest past capacity, `snapshot`/`clear`.
- `DumpLogsFlow`: body formatting, filename shape, note creation against a fake
  `NotesService`, the empty-buffer no-op (no note created, notice shown), and the
  write-failure error branch.
- `LoggingSettingsBridge`: a slice level change drives `gate.setThreshold`.

Quality gates: `npm run test`, `npm run check:types`, `npm run check:lint`.
