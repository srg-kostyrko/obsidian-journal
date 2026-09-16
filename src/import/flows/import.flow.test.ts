import { describe, expect, it, vi } from "vitest";

import { calendarSettingsModule } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { journalsSettingsModule } from "@/journals/settings/module";
import { startupModule } from "@/journals/startup/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesModule } from "@/shelves";
import { testContainer, type TestHarness } from "@/testing";

import { ImportConnectService, type ConnectPlan } from "../connect-service";
import { importCoreModule } from "../module";
import { buildCalendarSet, buildPeriodicConfig, periodicNotesStorePlugin } from "../testing";

import { ImportFromPluginsFlow } from "./import.flow";

import type { ImportSelection } from "../import-service";
import type { ImportPlan } from "../planner";

const MODULES = [
  journalsCoreModule,
  journalsSettingsModule,
  calendarSettingsModule,
  startupModule,
  shelvesModule,
  importCoreModule,
];

async function withPeriodicNotesDay(): Promise<TestHarness> {
  const harness = await testContainer({ modules: MODULES });
  harness.host.putPlugin(
    "periodic-notes",
    periodicNotesStorePlugin({
      calendarSets: [buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) })],
    }),
  );
  return harness;
}

describe("ImportFromPluginsFlow", () => {
  it("reports nothing to import without opening a dialog", async () => {
    const harness = await testContainer({ modules: MODULES });

    const result = await harness.resolve(ImportFromPluginsFlow).execute();

    expectErr(result);
    expect({ kind: result.error.kind, opened: harness.modals.opens.length }).toEqual({
      kind: "nothing-to-import",
      opened: 0,
    });
  });

  it("creates nothing when the preview is cancelled", async () => {
    const harness = await withPeriodicNotesDay();
    const running = harness.resolve(ImportFromPluginsFlow).execute();

    harness.modals.lastOpen().cancel();
    const result = await running;

    expectErr(result);
    expect({ kind: result.error.kind, journals: [...harness.resolve(JournalsRepository).find().list()] }).toEqual({
      kind: "user-aborted",
      journals: [],
    });
  });

  it("plans connections only once the week start it applied has re-anchored weekly notes", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        calendar: { mode: "custom", dow: 1, doy: 4, global: false },
        journals: { weekly: fixedJournal("weekly", { type: "week" }) },
      },
    });
    harness.host.putFile("Weekly/2026-W10.md", "", { journal: "weekly", "journal-date": "2026-03-02" });
    harness
      .resolve(JournalsIndex)
      .register({ journalName: "weekly", anchor: anchor("2026-03-02"), path: "Weekly/2026-W10.md" as VaultPath });
    harness.host.putPlugin("calendar", { options: { weekStart: "sunday" } });
    const connections = harness.resolve(ImportConnectService);
    const planConnections = connections.plan.bind(connections);
    let weeklyNoteDateAtPlanning: unknown;
    vi.spyOn(connections, "plan").mockImplementation((outcome) => {
      weeklyNoteDateAtPlanning = harness.host.files.get("Weekly/2026-W10.md")?.frontmatter["journal-date"];
      return planConnections(outcome);
    });
    const running = harness.resolve(ImportFromPluginsFlow).execute();
    const { plan } = harness.modals.lastOpen<{ plan: ImportPlan }>().props;

    harness.modals.lastOpen().submit({
      rows: plan.rows.map((row) => ({ key: row.key, name: row.name, include: true, connect: true })),
      shelves: [],
      applyWeekStart: true,
      setStartup: false,
    } satisfies ImportSelection);
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(2));
    harness.modals.lastOpen().submit(undefined);
    await running;

    expect(weeklyNoteDateAtPlanning).toBe("2026-03-01");
  });

  it("offers no connection for a journal it failed to create", async () => {
    const harness = await withPeriodicNotesDay();
    void harness.resolve(ImportFromPluginsFlow).execute();
    const { plan } = harness.modals.lastOpen<{ plan: ImportPlan }>().props;

    harness.modals.lastOpen().submit({
      rows: plan.rows.map((row) => ({ key: row.key, name: "", include: true, connect: true })),
      shelves: [],
      applyWeekStart: false,
      setStartup: false,
    } satisfies ImportSelection);
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(2));

    expect(harness.modals.lastOpen<{ connect: ConnectPlan }>().props.connect.rows).toEqual([]);
  });

  it("still reports the import when the connect window is dismissed", async () => {
    const harness = await withPeriodicNotesDay();
    const running = harness.resolve(ImportFromPluginsFlow).execute();
    const { plan } = harness.modals.lastOpen<{ plan: ImportPlan }>().props;

    harness.modals.lastOpen().submit({
      rows: plan.rows.map((row) => ({ key: row.key, name: row.name, include: true, connect: true })),
      shelves: [],
      applyWeekStart: false,
      setStartup: false,
    } satisfies ImportSelection);
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(2));
    harness.modals.lastOpen().cancel();
    const result = await running;

    expectOk(result);
    expect([...harness.resolve(JournalsRepository).find().list()]).toHaveLength(1);
  });
});
