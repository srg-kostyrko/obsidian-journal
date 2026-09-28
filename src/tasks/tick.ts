import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import type { BenignFlowError } from "@/infrastructure/flows";
import {
  NoteWriteError,
  NoticeService,
  NotesService,
  PluginSettingsReader,
  type NoteNotFoundError,
  type VaultPath,
} from "@/infrastructure/host";
import { AsyncResult, Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { checkboxSlice } from "./providers/checkbox/slice";
import { isDone } from "./status";

import type { TaskDisplay, TaskItem, TaskStatus } from "./types";

type LineDisplay = Extract<TaskDisplay, { kind: "line" }>;

// Anchored at the line start and everything before the marker is captured, never re-authored: the
// one matcher failure behind Time Ruler's data loss was a pattern loose enough to eat a leading
// number. The blockquote arm covers tasks inside a quote or a callout (`> [!todo]`), nested ones
// included — metadataCache lists those like any other list item, so they render as rows and a
// click on one has to land. The quote markers are bytes we found and did not name, so they ride
// through in the prefix untouched. The `u` flag is load-bearing: the status-map editor accepts any single
// code point as a marker, and without it `(.)` splits an emoji marker across the brackets and the
// match fails.
const MARKER = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)(.)(\])/u;

// The Tasks plugin owns this dialect signifier: a line carrying it needs Tasks's own toggle to
// spawn the next instance, which our status-character write cannot do (see RecurringToggle below).
const RECURRENCE_SIGNIFIER = "🔁";
const TASKS_PLUGIN_ID = "obsidian-tasks-plugin";

export type TickRefusal = "moved" | "not-a-task";

export type TickOutcome = { readonly content: string } | { readonly reason: TickRefusal };

export class TaskLineMovedError extends Error {
  readonly kind = "task-line-moved" as const;

  constructor(
    readonly path: VaultPath,
    readonly line: number,
  ) {
    super(`Line ${line} of ${path} no longer holds the task it was read from`);
    this.name = "TaskLineMovedError";
  }
}

export class NotATaskLineError extends Error {
  readonly kind = "not-a-task-line" as const;

  constructor(readonly path: VaultPath) {
    super(`Item in ${path} has no task line to tick`);
    this.name = "NotATaskLineError";
  }
}

export class NoCanonicalSymbolError extends Error {
  readonly kind = "no-canonical-symbol" as const;

  constructor(readonly status: TaskStatus) {
    super(`No marker is configured for ${status}`);
    this.name = "NoCanonicalSymbolError";
  }
}

// Benign: `NoApplicableJournals` is the documented precedent for this shape (CLAUDE.md) — the
// service already shows its own notice at the point the outcome is otherwise invisible, so a flow
// wrapping `toggle()` must stay silent on it rather than layering `flow_failure_notice` on top.
export class RecurringUnsupportedError extends Error implements BenignFlowError {
  readonly kind = "recurring-unsupported" as const;
  readonly benign = true as const;

  constructor(readonly path: VaultPath) {
    super(`${path} carries a recurring task and the Tasks plugin is not available to advance it`);
    this.name = "RecurringUnsupportedError";
  }
}

export type TickError =
  | TaskLineMovedError
  | NotATaskLineError
  | NoCanonicalSymbolError
  | RecurringUnsupportedError
  | NoteNotFoundError
  | NoteWriteError;

// `NaN` is the one that bites: it fails every `<` comparison, `Array.at(NaN)` reads index 0 so a
// bounds check passes, and `slice(0, NaN)`/`slice(NaN + 1)` then reassemble the note with a copy of
// itself appended. A fraction does not duplicate — `at` and `slice` truncate alike — but it would
// silently tick the floored line, which this path refuses to guess at.
function isAddressableLine(line: number): boolean {
  return Number.isSafeInteger(line) && line >= 0;
}

export function tickTargetStatus(status: TaskStatus): TaskStatus {
  return isDone(status) ? "todo" : "done";
}

// Recognition is many-to-one and writing is one-to-one, so the symbol comes from `canonical` and
// never from reading `statusMap` backwards. It can be missing: StatusMapEditor drops the entry
// when the last symbol answering for that status is removed. Falling back to the shipped default
// would write a marker this vault's own map reads as something else, so refuse instead — and
// refuse a value that is not one marker, which would break the checkbox shape rather than fill it.
// A line terminator is one code point and would cut the user's line in two, taking every item
// below it with it; StatusMapEditor trims and cannot author one, but the slice schema is a
// `v.record(v.string(), v.string())` behind a fallback, so a synced or hand-edited data.json
// reaches here with no repair.
export function canonicalSymbol(canonical: Record<string, string>, status: TaskStatus): string | null {
  const symbol: string | undefined = canonical[status];
  if (symbol === undefined || [...symbol].length !== 1 || /[\r\n]/u.test(symbol)) return null;
  return symbol;
}

export function tickLine(content: string, item: TaskItem, symbol: string): TickOutcome {
  const display = item.display;
  if (display.kind !== "line") return { reason: "not-a-task" };
  if (!isAddressableLine(display.line)) return { reason: "moved" };
  const lines = content.split("\n");
  const current = lines.at(display.line);
  // The item's markdown was hydrated from a read that may now be stale, and an item that was
  // never hydrated carries none at all. Writing by line number alone would stamp a status
  // character into whatever line drifted into that position. An item spanning several lines is
  // verified on its first line only: a continuation the user has since edited is not a move.
  const hydrated = display.markdown?.split("\n", 1).at(0);
  if (current === undefined || hydrated === undefined || current !== hydrated) return { reason: "moved" };
  const match = MARKER.exec(current);
  if (match === null) return { reason: "not-a-task" };
  const [, prefix, , suffix] = match;
  // The status character is replaced by index and nothing else is touched: the line is never
  // rebuilt from a parsed model, and no signifier the user did not write is inserted. Dialect
  // markers, inline fields, trailing tags, block ids and whitespace all survive as bytes.
  const replaced = `${prefix}${symbol}${suffix}${current.slice(match[0].length)}`;
  return { content: [...lines.slice(0, display.line), replaced, ...lines.slice(display.line + 1)].join("\n") };
}

// Signature of the Tasks plugin's own apiV1.executeToggleTaskDoneCommand: it returns the
// replacement text for the line (one or more lines, newline-joined, since a recurring task's
// toggle appends the next instance) rather than writing anything itself.
export type RecurringToggle = (line: string, path: string) => string;

// Three explicit variants rather than nesting TickRefusal's two literals inside one — that would
// leave `reason` typed as a two-literal union at the outer level, and checking both literals off
// still doesn't let the compiler discriminate down to the third variant and its `cause` field.
export type TickRecurringRefusal =
  | { readonly reason: "moved" }
  | { readonly reason: "not-a-task" }
  // Their call is a third party's, not ours: it can throw, and nothing in the published apiV1
  // signature is enforced at runtime, so a return that is not a string reaches us as readily as
  // one that is. Both are the plugin failing to hold up its end, not a shape this vault authored.
  | { readonly reason: "delegate-failed"; readonly cause: unknown };

export type TickRecurringOutcome = TickRecurringRefusal | { readonly content: string };

// Mirrors tickLine's moved/not-a-task guards on the INPUT line — it must still be the one this
// item was hydrated from, and it must still look like a task — but the replacement comes from
// Tasks itself rather than from a single-character substitution, since Tasks decides both the
// written symbol and whether a next-instance line is appended. The MARKER check on the input also
// keeps a non-task line from ever reaching Tasks's own fallback parsing, which is permissive
// enough to turn arbitrary prose into a checkbox line.
//
// The OUTPUT gets the same scrutiny before it is spliced in, never the unconditional trust a
// third party's return value would otherwise get: a throw or a non-string return is a delegate
// failure (the write rule's clause 1 exists to stop exactly this — a rebuild that drops or
// mangles what was there — and an empty or malformed return is that same harm arriving from
// Tasks's side of the boundary instead of ours), and a call that returns cleanly but produces
// something that no longer matches MARKER (including "", which erases the line) is refused the
// same way a not-a-task input line is. See docs/tasks-model.md's "Ticking an item" section for the
// write-rule carve-out this delegation relies on.
export function tickRecurringLine(content: string, item: TaskItem, toggle: RecurringToggle): TickRecurringOutcome {
  const display = item.display;
  if (display.kind !== "line") return { reason: "not-a-task" };
  if (!isAddressableLine(display.line)) return { reason: "moved" };
  const lines = content.split("\n");
  const current = lines.at(display.line);
  const hydrated = display.markdown?.split("\n", 1).at(0);
  if (current === undefined || hydrated === undefined || current !== hydrated) return { reason: "moved" };
  if (MARKER.exec(current) === null) return { reason: "not-a-task" };

  let raw: unknown;
  try {
    raw = toggle(current, item.path);
  } catch (error) {
    return { reason: "delegate-failed", cause: error };
  }
  if (typeof raw !== "string") return { reason: "delegate-failed", cause: raw };
  // MARKER has no `m` flag, so `^` anchors to the start of `raw` as a whole — this reads the same
  // first line`.exec` would after a `split`, with no `.at(0) ?? ""` fallback that `split` (which
  // never returns an empty array, even for `""`) can never actually take.
  if (MARKER.exec(raw) === null) return { reason: "not-a-task" };

  const replacement = raw.split("\n");
  return { content: [...lines.slice(0, display.line), ...replacement, ...lines.slice(display.line + 1)].join("\n") };
}

/**
 * Writes a task item's status character into its note.
 */
export class TickService {
  readonly #notes = inject(NotesService);
  readonly #settings = inject(SettingsService).getSlice(checkboxSlice);
  readonly #plugins = inject(PluginSettingsReader);
  readonly #notices = inject(NoticeService);

  // No plugin, or a plugin exposing no toggle, both refuse rather than write: a programmatic
  // write here would tick the line ourselves and never create the next instance, ending the
  // series with nothing failing loudly. Same capability-check-and-fall-back discipline
  // TemplaterService applies to Templater's own `parse_commands`.
  #toggleRecurring(item: TaskItem, display: LineDisplay): AsyncResult<void, TickError> {
    const toggle = this.#tasksToggle();
    if (toggle === null) {
      // The otherwise-invisible outcome this fires for: the series just stops advancing, and
      // nothing else in this path would ever tell the user why.
      this.#notices.show(m.tasks_tick_recurring_needs_tasks_plugin());
      return AsyncResult.err(new RecurringUnsupportedError(item.path));
    }
    const refusals: TickRecurringRefusal[] = [];
    return this.#notes
      .process(item.path, (content) => {
        const outcome = tickRecurringLine(content, item, toggle);
        if ("reason" in outcome) {
          refusals.push(outcome);
          return content;
        }
        return outcome.content;
      })
      .flatMap((): Result<void, TickError> => this.#resolveRecurringRefusal(refusals, item.path, display.line));
  }

  #resolveRefusal(refusals: readonly TickRefusal[], path: VaultPath, line: number): Result<void, TickError> {
    const refusal = refusals.at(0);
    if (refusal === undefined) return new Ok(undefined);
    return new Err(refusal === "moved" ? new TaskLineMovedError(path, line) : new NotATaskLineError(path));
  }

  // Kept separate from #resolveRefusal above rather than widening it: the non-recurring path can
  // never produce "delegate-failed", and folding this case into the shared helper would let a
  // caller that only ever calls tickLine hold a refusal type it can't actually receive.
  #resolveRecurringRefusal(
    refusals: readonly TickRecurringRefusal[],
    path: VaultPath,
    line: number,
  ): Result<void, TickError> {
    const refusal = refusals.at(0);
    if (refusal === undefined) return new Ok(undefined);
    if (refusal.reason === "moved") return new Err(new TaskLineMovedError(path, line));
    if (refusal.reason === "not-a-task") return new Err(new NotATaskLineError(path));
    return new Err(new NoteWriteError(path, refusal.cause));
  }

  // Known divergence, not fixed here: Tasks writes its own hardcoded done symbol ("x") on a
  // recurring line's completed instance, regardless of this vault's status map — the map governs
  // only the non-recurring path above, since Tasks owns the write for this one.
  #tasksToggle(): RecurringToggle | null {
    const plugin = this.#plugins.communityPlugin(TASKS_PLUGIN_ID);
    if (plugin.isNone()) return null;
    const apiV1 = (plugin.value as { apiV1?: unknown }).apiV1;
    if (!apiV1 || typeof apiV1 !== "object") return null;
    const toggle = (apiV1 as Record<string, unknown>).executeToggleTaskDoneCommand;
    return typeof toggle === "function" ? (toggle as RecurringToggle) : null;
  }

  // A line carrying 🔁 needs the Tasks plugin's own toggle command to advance the series; this
  // writes the status character itself, which marks such a line done and creates no next instance.
  toggle(item: TaskItem): AsyncResult<void, TickError> {
    const display = item.display;
    if (display.kind !== "line") return AsyncResult.err(new NotATaskLineError(item.path));
    // Decidable from the item alone, so it is settled before the note is opened, the same as the
    // symbol below.
    if (!isAddressableLine(display.line)) return AsyncResult.err(new TaskLineMovedError(item.path, display.line));

    // Also decidable up front, off the hydrated markdown rather than the note's live content —
    // the note is not open yet, and the recurrence signifier is what the Tasks plugin itself
    // reads, so it belongs to the dialect on the line, not to anything we compute.
    const firstLine = display.markdown?.split("\n", 1).at(0);
    if (firstLine?.includes(RECURRENCE_SIGNIFIER)) {
      return this.#toggleRecurring(item, display);
    }

    const target = tickTargetStatus(item.status);
    const symbol = canonicalSymbol(this.#settings.state.canonical, target);
    if (symbol === null) return AsyncResult.err(new NoCanonicalSymbolError(target));
    // The verdict is reached inside vault.process's lock, against the content the lock is holding,
    // and has to leave the closure — a captured `let` read afterwards keeps its initial narrowing.
    const refusals: TickRefusal[] = [];
    return this.#notes
      .process(item.path, (content) => {
        const outcome = tickLine(content, item, symbol);
        if ("reason" in outcome) {
          refusals.push(outcome.reason);
          return content;
        }
        return outcome.content;
      })
      .flatMap((): Result<void, TickError> => this.#resolveRefusal(refusals, item.path, display.line));
  }
}
