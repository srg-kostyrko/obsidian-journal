import { describe, expect, it, vi } from "vitest";

import { calendarSettingsModule } from "@/calendar";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { journalsSettingsModule } from "@/journals/settings/module";
import { startupModule } from "@/journals/startup/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";
import { ShelvesRepository, shelvesModule } from "@/shelves";
import { testContainer, type TestContainerOptions, type TestHarness } from "@/testing";

import { ImportService, type ImportSelection } from "./import-service";
import { importCoreModule } from "./module";
import { ImportPlanner, type ImportPlan } from "./planner";
import { buildCalendarSet, buildPeriodicConfig, periodicNotesStorePlugin } from "./testing";

async function planned(
  sets: Record<string, unknown>[],
  data: TestContainerOptions["data"] = {},
): Promise<{ harness: TestHarness; plan: ImportPlan }> {
  const harness = await testContainer({
    modules: [
      journalsCoreModule,
      journalsSettingsModule,
      calendarSettingsModule,
      startupModule,
      shelvesModule,
      importCoreModule,
    ],
    data,
  });
  harness.host.putPlugin("periodic-notes", periodicNotesStorePlugin({ calendarSets: sets }));
  return { harness, plan: harness.resolve(ImportPlanner).plan() };
}

function everything(plan: ImportPlan): ImportSelection {
  return {
    rows: plan.rows.map((row) => ({ key: row.key, name: row.name, include: row.state.kind === "new", connect: true })),
    applyWeekStart: true,
    setStartup: true,
  };
}

describe("ImportService", () => {
  it("creates a journal with the planned folder, date format and template", async () => {
    const { harness, plan } = await planned([
      buildCalendarSet("Default", {
        day: buildPeriodicConfig({ folder: "Journal", format: "YYYY/MM/DD", templatePath: "Templates/Day" }),
      }),
    ]);

    await harness.resolve(ImportService).apply(plan, everything(plan));

    const created = harness
      .resolve(JournalsRepository)
      .get(m.import_journal_name({ period: "day" }))
      .getOrUndefined();
    expect({
      folder: created?.folder,
      dateFormat: created?.dateFormat,
      nameTemplate: created?.nameTemplate,
      templates: created?.templates,
    }).toEqual({
      folder: "Journal/{{date:YYYY}}/{{date:MM}}",
      dateFormat: "DD",
      nameTemplate: "{{date}}",
      templates: ["Templates/Day"],
    });
  });

  it("takes the snapshot before the first settings write", async () => {
    const { harness, plan } = await planned([buildCalendarSet("Default", { day: buildPeriodicConfig() })]);
    const snapshot = vi.spyOn(harness.resolve(SettingsService), "snapshotBeforeImport");
    const create = vi.spyOn(harness.resolve(JournalsRepository), "create");

    await harness.resolve(ImportService).apply(plan, everything(plan));

    expect(snapshot.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0] ?? 0);
  });

  it("numbers a name taken between preview and import", async () => {
    const { harness, plan } = await planned([
      buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) }),
    ]);
    const name = m.import_journal_name({ period: "day" });
    harness.resolve(JournalsRepository).create(name, { type: "day" });

    const outcome = await harness.resolve(ImportService).apply(plan, everything(plan));

    expect(outcome.rows.at(0)).toMatchObject({
      kind: "created",
      journalName: m.import_journal_name_indexed({ name, index: 2 }),
    });
  });

  it("does not make a journal it failed to create the startup journal", async () => {
    const { harness, plan } = await planned([
      buildCalendarSet("Default", { day: buildPeriodicConfig({ openAtStartup: true }) }),
    ]);
    const selection = everything(plan);

    const outcome = await harness.resolve(ImportService).apply(plan, {
      ...selection,
      rows: selection.rows.map((row) => ({ ...row, name: "" })),
    });

    expect({ row: outcome.rows.at(0)?.kind, startup: outcome.startup }).toEqual({
      row: "failed",
      startup: { kind: "none" },
    });
  });

  it("sets the startup journal to the imported journal", async () => {
    const { harness, plan } = await planned([
      buildCalendarSet("Default", { day: buildPeriodicConfig({ openAtStartup: true }) }),
    ]);

    const outcome = await harness.resolve(ImportService).apply(plan, everything(plan));

    expect(outcome.startup).toEqual({ kind: "set", journalName: m.import_journal_name({ period: "day" }) });
  });

  it("sets the startup journal to a journal that was already set up", async () => {
    const { harness, plan } = await planned(
      [buildCalendarSet("Default", { day: buildPeriodicConfig({ openAtStartup: true }) })],
      {
        journals: { days: fixedJournal("days", { type: "day" }) },
      },
    );
    const planWithSetUp: ImportPlan = {
      ...plan,
      rows: plan.rows.map((row) => ({ ...row, state: { kind: "set-up", journalName: "days" } })),
    };

    const outcome = await harness.resolve(ImportService).apply(planWithSetUp, everything(planWithSetUp));

    expect(outcome.startup).toEqual({ kind: "set", journalName: "days" });
  });

  it("shelves each calendar set's journals, reusing a shelf that already exists", async () => {
    const { harness, plan } = await planned(
      [
        buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "A" }) }),
        buildCalendarSet("Work", { day: buildPeriodicConfig({ folder: "B" }) }),
      ],
      {},
    );
    harness.resolve(ShelvesRepository).create("Work");

    const outcome = await harness.resolve(ImportService).apply(plan, everything(plan));

    expect(outcome.shelves).toEqual([
      { name: "Default", kind: "created" },
      { name: "Work", kind: "existing" },
    ]);
  });

  it("leaves a journal that is already set up untouched", async () => {
    const { harness, plan } = await planned(
      [buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) })],
      {
        journals: {},
      },
    );
    const planWithSetUp: ImportPlan = {
      ...plan,
      rows: plan.rows.map((row) => ({ ...row, state: { kind: "set-up", journalName: "days" } })),
    };
    const create = vi.spyOn(harness.resolve(JournalsRepository), "create");

    const outcome = await harness.resolve(ImportService).apply(planWithSetUp, everything(planWithSetUp));

    expect({ created: create.mock.calls.length, row: outcome.rows.at(0) }).toEqual({
      created: 0,
      row: { key: plan.rows.at(0)?.key, kind: "existing", journalName: "days", connect: true },
    });
  });
});
