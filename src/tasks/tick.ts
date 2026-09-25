import { inject } from "@/infrastructure/di";
import { NotesService, type NoteNotFoundError, type NoteWriteError, type VaultPath } from "@/infrastructure/host";
import { AsyncResult, Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { checkboxSlice } from "./providers/checkbox/slice";
import { isDone } from "./status";

import type { TaskItem, TaskStatus } from "./types";

// Anchored at the line start and deliberately narrow: the one matcher failure behind Time Ruler's
// data loss was a pattern loose enough to eat a leading number. A task inside a blockquote or a
// callout (`> - [ ] …`) therefore does not match and is refused rather than rewritten — those
// lines are extracted as items, so ticking one needs this matcher widened on purpose first.
// The `u` flag is load-bearing: the status-map editor accepts any single code point as a marker,
// and without it `(.)` splits an emoji marker across the brackets and the match fails.
const MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\])/u;

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

export type TickError =
  TaskLineMovedError | NotATaskLineError | NoCanonicalSymbolError | NoteNotFoundError | NoteWriteError;

export function tickTargetStatus(status: TaskStatus): TaskStatus {
  return isDone(status) ? "todo" : "done";
}

// Recognition is many-to-one and writing is one-to-one, so the symbol comes from `canonical` and
// never from reading `statusMap` backwards. It can be missing: StatusMapEditor drops the entry
// when the last symbol answering for that status is removed. Falling back to the shipped default
// would write a marker this vault's own map reads as something else, so refuse instead — and
// refuse a value that is not one marker, which would break the checkbox shape rather than fill it.
export function canonicalSymbol(canonical: Record<string, string>, status: TaskStatus): string | null {
  const symbol: string | undefined = canonical[status];
  return symbol !== undefined && [...symbol].length === 1 ? symbol : null;
}

export function tickLine(content: string, item: TaskItem, symbol: string): TickOutcome {
  const display = item.display;
  if (display.kind !== "line") return { reason: "not-a-task" };
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

/**
 * Writes a task item's status character into its note.
 */
export class TickService {
  readonly #notes = inject(NotesService);
  readonly #settings = inject(SettingsService).getSlice(checkboxSlice);

  // A line carrying 🔁 needs the Tasks plugin's own toggle command to advance the series; this
  // writes the status character itself, which marks such a line done and creates no next instance.
  toggle(item: TaskItem): AsyncResult<void, TickError> {
    const display = item.display;
    if (display.kind !== "line") return AsyncResult.err(new NotATaskLineError(item.path));
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
      .flatMap((): Result<void, TickError> => {
        const refusal = refusals.at(0);
        if (refusal === undefined) return new Ok(undefined);
        return new Err(
          refusal === "moved" ? new TaskLineMovedError(item.path, display.line) : new NotATaskLineError(item.path),
        );
      });
  }
}
