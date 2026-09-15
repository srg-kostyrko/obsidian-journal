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

export interface ImportSelection {
  readonly rows: readonly RowSelection[];
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

  #shelve(names: readonly string[]): ShelfOutcome[] {
    return names.map((name): ShelfOutcome => {
      if (this.#shelves.exists(name)) return { name, kind: "existing" };
      const created = this.#shelves.create(name);
      return created.isOk() ? { name, kind: "created" } : { name, kind: "failed", message: created.error.message };
    });
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

    const shelves = this.#shelve(plan.shelves);
    const usableShelves = new Set(shelves.filter((shelf) => shelf.kind !== "failed").map((shelf) => shelf.name));

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
      if (row.shelf !== undefined && usableShelves.has(row.shelf)) {
        // No outcome slot exists for a shelving failure; the journal itself was created fine.
        const assigned = this.#shelving.assign(name, row.shelf);
        if (assigned.isErr()) {
          this.#logger.warn("could not place an imported journal on its shelf", {
            journal: name,
            shelf: row.shelf,
            error: assigned.error,
          });
        }
      }
      return { key: row.key, kind: "created", journalName: name, connect: chosen.connect };
    });

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
