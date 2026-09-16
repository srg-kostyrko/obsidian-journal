import { WeekPresetApplierToken } from "@/calendar";
import { m } from "@/i18n";
import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { freeName } from "@/journals/free-name";
import { JournalsRepository } from "@/journals/repository";
import { startupSlice } from "@/journals/startup/slice";
import { SettingsService } from "@/settings";
import { ShelvesRepository } from "@/shelves/repository";
import { ShelvesService } from "@/shelves/service";

import type { ImportPlan } from "./planner";

export interface RowSelection {
  readonly key: string;
  readonly name: string;
  readonly include: boolean;
  readonly connect: boolean;
}

export interface ShelfSelection {
  /** The shelf name the plan proposed, which the preview may have renamed. */
  readonly planned: string;
  readonly name: string;
}

export interface ImportSelection {
  readonly rows: readonly RowSelection[];
  readonly shelves: readonly ShelfSelection[];
  readonly applyWeekStart: boolean;
  readonly setStartup: boolean;
}

export type RowOutcome =
  | { readonly key: string; readonly kind: "created"; readonly journalName: string; readonly connect: boolean }
  | { readonly key: string; readonly kind: "existing"; readonly journalName: string; readonly connect: boolean }
  | { readonly key: string; readonly kind: "failed"; readonly name: string; readonly message: string }
  | { readonly key: string; readonly kind: "skipped" };

export type ShelfOutcome =
  | { readonly name: string; readonly kind: "created" | "existing" }
  | { readonly name: string; readonly kind: "failed"; readonly message: string };

export type StartupOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "set"; readonly journalName: string }
  | { readonly kind: "kept"; readonly journalName: string };

export interface ImportOutcome {
  readonly snapshotWritten: boolean;
  readonly weekStartApplied: boolean;
  readonly shelves: readonly ShelfOutcome[];
  readonly rows: readonly RowOutcome[];
  readonly startup: StartupOutcome;
}

export class ImportService {
  readonly #settings = inject(SettingsService);
  readonly #weekPreset = inject(WeekPresetApplierToken);
  readonly #journals = inject(JournalsRepository);
  readonly #shelves = inject(ShelvesRepository);
  readonly #shelving = inject(ShelvesService);
  readonly #logger = inject(LoggerFactoryToken).named("import");

  // Creating every planned shelf up front would leave an empty shelf behind for a calendar set
  // whose journals were all switched off, or all failed to create — so a shelf is created (or
  // reused) only once the first journal that actually lands on it exists, and the outcome is
  // cached so a later journal on the same shelf does not create it twice.
  #shelfFor(name: string, cache: Map<string, ShelfOutcome>): ShelfOutcome {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    let outcome: ShelfOutcome;
    if (this.#shelves.exists(name)) {
      outcome = { name, kind: "existing" };
    } else {
      const created = this.#shelves.create(name);
      outcome = created.isOk() ? { name, kind: "created" } : { name, kind: "failed", message: created.error.message };
    }
    cache.set(name, outcome);
    return outcome;
  }

  // Each step is best-effort: a failure is reported and only what depends on it is dropped.
  async apply(plan: ImportPlan, selection: ImportSelection): Promise<ImportOutcome> {
    const snapshotWritten = await this.#settings.snapshotBeforeImport();

    // Before any journal exists: re-anchoring touches weekly notes already connected, and connect
    // planning afterwards must see the new grid.
    let weekStartApplied = false;
    if (selection.applyWeekStart && plan.weekStart.kind === "offer") {
      await this.#weekPreset.apply(plan.weekStart.next);
      weekStartApplied = true;
    }

    // Insertion order doubles as first-use order: a shelf enters this only from inside the rows
    // loop below, the first time a row that actually creates a journal names it.
    const shelfOutcomes = new Map<string, ShelfOutcome>();

    const rows = plan.rows.map((row): RowOutcome => {
      const chosen = selection.rows.find((candidate) => candidate.key === row.key);
      if (row.state.kind === "set-up") {
        return {
          key: row.key,
          kind: "existing",
          journalName: row.state.journalName,
          connect: chosen?.connect ?? false,
        };
      }
      if (!chosen?.include) return { key: row.key, kind: "skipped" };
      const name = freeName(
        chosen.name,
        (index) => m.import_journal_name_indexed({ name: chosen.name, index }),
        (candidate) => this.#journals.exists(candidate),
      );
      const created = this.#journals.create(name, { type: row.journal.period });
      if (created.isErr()) return { key: row.key, kind: "failed", name, message: created.error.message };
      const updated = this.#journals.update(name, {
        folder: row.folder,
        dateFormat: row.dateFormat,
        nameTemplate: "{{date}}",
        templates: [...row.journal.templates],
      });
      if (updated.isErr()) return { key: row.key, kind: "failed", name, message: updated.error.message };
      const shelf =
        row.shelf === undefined
          ? undefined
          : (selection.shelves.find((candidate) => candidate.planned === row.shelf)?.name ?? row.shelf);
      if (shelf !== undefined && this.#shelfFor(shelf, shelfOutcomes).kind !== "failed") {
        // No outcome slot exists for a shelving failure; the journal itself was created fine.
        const assigned = this.#shelving.assign(name, shelf);
        if (assigned.isErr()) {
          this.#logger.warn("could not place an imported journal on its shelf", {
            journal: name,
            shelf,
            error: assigned.error,
          });
        }
      }
      return { key: row.key, kind: "created", journalName: name, connect: chosen.connect };
    });

    const shelves = [...shelfOutcomes.values()];

    let startup: StartupOutcome = { kind: "none" };
    if (plan.startup.kind === "kept") {
      startup = plan.startup;
    } else if (plan.startup.kind === "set" && selection.setStartup) {
      const rowKey = plan.startup.rowKey;
      const target = rows.find((row) => row.key === rowKey);
      const slice = this.#settings.getSlice(startupSlice);
      // A row already "set-up" is still that period's journal: the period Periodic Notes opens at
      // startup becomes the startup journal whether it was just created or already existed.
      if ((target?.kind === "created" || target?.kind === "existing") && slice.state.journalName === "") {
        slice.state = { ...slice.state, journalName: target.journalName };
        startup = { kind: "set", journalName: target.journalName };
      }
    }

    return { snapshotWritten, weekStartApplied, shelves, rows, startup };
  }
}
