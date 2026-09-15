import { CalendarDate } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { CycleService } from "@/journals/cycle";
import { BulkAddService, type PlannedAction, type SkipReason } from "@/journals/notes/bulk-add/bulk-add-service";
import { defaultBulkAddParameters } from "@/journals/notes/bulk-add/config";
import { invertibilityOf, type InvertibilityWarning } from "@/journals/notes/invertibility";
import { NotePathService } from "@/journals/notes/note-path";
import { splitVaultPath } from "@/journals/notes/vault-path";
import { JournalsRepository } from "@/journals/repository";
import { TemplateEngine } from "@/templates";

import type { ImportOutcome, RowOutcome } from "./import-service";

export type ConnectSkipReason = SkipReason | "period-has-note" | "matches-several-journals";

export interface ConnectSkip {
  readonly path: VaultPath;
  readonly reason: ConnectSkipReason;
}

export interface ConnectRowPlan {
  readonly journalName: string;
  readonly blocked?: InvertibilityWarning;
  readonly actions: readonly PlannedAction[];
  readonly skips: readonly ConnectSkip[];
}

export interface ConnectPlan {
  readonly rows: readonly ConnectRowPlan[];
}

export interface ConnectRowReport {
  readonly journalName: string;
  readonly connected: number;
  readonly failed: readonly { readonly path: VaultPath; readonly message: string }[];
}

export interface ConnectReport {
  readonly rows: readonly ConnectRowReport[];
}

// Bulk add scans a folder, but a journal's folder may itself hold date variables. Scan from the
// deepest part that has none: every note the journal writes lives under it.
function staticFolderOf(folder: string): string {
  const segments = folder.split("/");
  const firstDynamic = segments.findIndex((segment) => segment.includes("{{"));
  return (firstDynamic === -1 ? segments : segments.slice(0, firstDynamic)).join("/");
}

// A journal at the vault root scans every note. Only one whose name parses as a date is a note
// Periodic Notes could have found by name; anything else was never this journal's.
function namedByDateFormat(path: VaultPath, dateFormat: string): boolean {
  const basename = splitVaultPath(path)[1].replace(/\.md$/, "");
  return CalendarDate.parse(basename, dateFormat).isOk();
}

// Two rows can name one existing journal, e.g. two calendar sets set up alike. Planned twice, each
// of its notes would read as matching several journals when it matches only that one.
function journalsToConnect(rows: readonly RowOutcome[]): { journalName: string }[] {
  const connect = new Map<string, boolean>();
  for (const row of rows) {
    if (row.kind !== "created" && row.kind !== "existing") continue;
    connect.set(row.journalName, (connect.get(row.journalName) ?? false) || row.connect);
  }
  return [...connect].flatMap(([journalName, wanted]) => (wanted ? [{ journalName }] : []));
}

// A note on two journals' paths is connected to neither — the rule auto-attach follows.
function withoutShared(rows: readonly ConnectRowPlan[]): ConnectRowPlan[] {
  const claims = new Map<VaultPath, number>();
  for (const row of rows) {
    for (const action of row.actions) claims.set(action.path, (claims.get(action.path) ?? 0) + 1);
  }
  return rows.map((row) => {
    const shared = row.actions.filter((action) => (claims.get(action.path) ?? 0) > 1);
    if (shared.length === 0) return row;
    return {
      ...row,
      actions: row.actions.filter((action) => (claims.get(action.path) ?? 0) === 1),
      skips: [
        ...row.skips,
        ...shared.map((action) => ({ path: action.path, reason: "matches-several-journals" as const })),
      ],
    };
  });
}

export class ImportConnectService {
  readonly #journals = inject(JournalsRepository);
  readonly #bulkAdd = inject(BulkAddService);
  readonly #engine = inject(TemplateEngine);
  readonly #cycle = inject(CycleService);
  readonly #paths = inject(NotePathService);

  async plan(outcome: ImportOutcome): Promise<ConnectPlan> {
    const rows: ConnectRowPlan[] = [];
    for (const row of journalsToConnect(outcome.rows)) {
      const config = this.#journals.get(row.journalName).getOrUndefined();
      if (config === undefined) continue;
      const blocked = invertibilityOf(config, { engine: this.#engine, cycle: this.#cycle, paths: this.#paths });
      if (blocked !== null) {
        rows.push({ journalName: row.journalName, blocked, actions: [], skips: [] });
        continue;
      }
      const planned = await this.#bulkAdd.plan(row.journalName, {
        ...defaultBulkAddParameters(),
        folder: staticFolderOf(config.folder),
        datePlace: "path",
        dateFormat: "",
        existingNote: "skip",
        otherFolder: "keep",
        otherName: "keep",
        dryRun: false,
      });
      // The only error is a missing folder: a journal whose folder does not exist has no notes yet.
      const notes = planned.isOk() ? planned.value.notes : [];
      rows.push({
        journalName: row.journalName,
        actions: notes.flatMap((note) => (note.kind === "action" && note.existing === "none" ? [note] : [])),
        skips: notes.flatMap((note): ConnectSkip[] => {
          if (note.kind === "skip" && note.reason === "not-on-journal-path") {
            return namedByDateFormat(note.path, config.dateFormat) ? [{ path: note.path, reason: note.reason }] : [];
          }
          if (note.kind === "skip") return [{ path: note.path, reason: note.reason }];
          return note.existing === "none" ? [] : [{ path: note.path, reason: "period-has-note" }];
        }),
      });
    }
    return { rows: withoutShared(rows) };
  }

  async apply(connect: ConnectPlan, onProgress?: (done: number, total: number) => void): Promise<ConnectReport> {
    const total = connect.rows.reduce((sum, row) => sum + (row.blocked === undefined ? row.actions.length : 0), 0);
    let offset = 0;
    const rows: ConnectRowReport[] = [];
    for (const row of connect.rows) {
      if (row.blocked !== undefined || row.actions.length === 0) {
        rows.push({ journalName: row.journalName, connected: 0, failed: [] });
        continue;
      }
      const resolved = this.#bulkAdd.resolve(row.actions, { existing: {}, folder: {}, name: {} });
      const start = offset;
      const log = await this.#bulkAdd.apply(row.journalName, resolved, false, (done) =>
        onProgress?.(start + done, total),
      );
      offset += row.actions.length;
      const entries = log.isOk() ? log.value : [];
      rows.push({
        journalName: row.journalName,
        connected: entries.filter(
          (entry) =>
            entry.actions.some((action) => action.kind === "connected") &&
            entry.actions.every((action) => action.kind !== "failed"),
        ).length,
        failed: entries.flatMap((entry) =>
          entry.actions.flatMap((action) =>
            action.kind === "failed" ? [{ path: entry.path, message: action.message }] : [],
          ),
        ),
      });
    }
    return { rows };
  }
}
