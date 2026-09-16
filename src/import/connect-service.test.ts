import { describe, expect, it } from "vitest";

import { CalendarDate, calendarSettingsModule, type CalendarSliceState } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import type { JournalConfig } from "@/journals/config";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { NotePathService } from "@/journals/notes/note-path";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { ImportConnectService } from "./connect-service";
import { importCoreModule } from "./module";
import { buildImportOutcome } from "./testing";

async function harnessWith(journals: Record<string, JournalConfig>): Promise<TestHarness> {
  return testContainer({ modules: [journalsCoreModule, importCoreModule], data: { journals } });
}

const daily = (name: string, overrides: Partial<JournalConfig> = {}): JournalConfig =>
  fixedJournal(
    name,
    { type: "day" },
    { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}", ...overrides },
  );

const WEEKS_AROUND_NEW_YEAR = ["2025-12-22", "2025-12-29", "2026-01-05", "2026-12-21", "2026-12-28", "2027-01-04"];

// Writes the imported weekly journal's note for each week around two New Years, then reads the
// connect plan back: each note must return to the week it was written for, and to the same path.
async function weekYearRoundTrip(calendar?: CalendarSliceState) {
  const harness = await testContainer({
    modules: [journalsCoreModule, calendarSettingsModule, importCoreModule],
    data: {
      journals: {
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          { folder: "Weekly", dateFormat: "gggg-[W]ww", nameTemplate: "{{date}}" },
        ),
      },
      ...(calendar !== undefined && { calendar }),
    },
  });
  const written = WEEKS_AROUND_NEW_YEAR.map((day) => {
    const path = harness.resolve(NotePathService).pathForDate("weekly", date(day));
    return {
      path: path.isOk() ? path.value : undefined,
      anchor: CalendarDate.fromAnchor(anchor(day)).startOf("week").toAnchor(),
    };
  });
  for (const { path } of written) if (path !== undefined) harness.host.putFile(path);

  const plan = await harness
    .resolve(ImportConnectService)
    .plan(buildImportOutcome([{ key: "k", kind: "created", journalName: "weekly", connect: true }]));

  return {
    expected: written.map(({ path, anchor: week }) => ({ path, anchor: week, targetPath: path })),
    actual: (plan.rows.at(0)?.actions ?? [])
      .map((action) => ({ path: action.path, anchor: action.anchor, targetPath: action.targetPath }))
      .toSorted((a, b) => a.anchor.localeCompare(b.anchor)),
  };
}

describe("ImportConnectService", () => {
  describe("an imported week-year weekly journal", () => {
    it("reads its notes back across New Year under the locale's week grid", async () => {
      const { expected, actual } = await weekYearRoundTrip();

      expect(actual).toEqual(expected);
    });

    it("reads its notes back across New Year under a custom Monday week grid", async () => {
      const { expected, actual } = await weekYearRoundTrip({ mode: "custom", dow: 1, doy: 4, global: false });

      expect(actual).toEqual(expected);
    });
  });

  it("plans every note at the journal's path", async () => {
    const harness = await harnessWith({ daily: daily("daily") });
    harness.host.putFile("Journal/2026-06-01.md");

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]));

    expect(plan.rows.at(0)?.actions.map((action) => action.path)).toEqual(["Journal/2026-06-01.md"]);
  });

  it("scans from the deepest folder without date variables", async () => {
    const harness = await harnessWith({
      daily: daily("daily", { folder: "Journal/{{date:YYYY}}", dateFormat: "MM-DD" }),
    });
    harness.host.putFile("Journal/2026/06-01.md");

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]));

    expect(plan.rows.at(0)?.actions.map((action) => action.path)).toEqual(["Journal/2026/06-01.md"]);
  });

  it("reports only notes named by the date format as off the path of a journal at the vault root", async () => {
    const harness = await harnessWith({ daily: daily("daily", { folder: "" }) });
    harness.host.putFile("2026-06-01.md");
    harness.host.putFile("Projects/plan.md");
    harness.host.putFile("Archive/2026-06-02.md");

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]));

    expect({ actions: plan.rows.at(0)?.actions.map((action) => action.path), skips: plan.rows.at(0)?.skips }).toEqual({
      actions: ["2026-06-01.md"],
      skips: [{ path: "Archive/2026-06-02.md", reason: "not-on-journal-path" }],
    });
  });

  it("connects a note on two journals' paths to neither", async () => {
    const harness = await harnessWith({ first: daily("first"), second: daily("second") });
    harness.host.putFile("Journal/2026-06-01.md");

    const plan = await harness.resolve(ImportConnectService).plan(
      buildImportOutcome([
        { key: "a", kind: "existing", journalName: "first", connect: true },
        { key: "b", kind: "existing", journalName: "second", connect: true },
      ]),
    );

    expect(plan.rows.map((row) => ({ actions: row.actions.length, skips: row.skips }))).toEqual([
      { actions: 0, skips: [{ path: "Journal/2026-06-01.md", reason: "matches-several-journals" }] },
      { actions: 0, skips: [{ path: "Journal/2026-06-01.md", reason: "matches-several-journals" }] },
    ]);
  });

  it("plans a journal that two rows name once", async () => {
    const harness = await harnessWith({ daily: daily("daily") });
    harness.host.putFile("Journal/2026-06-01.md");

    const plan = await harness.resolve(ImportConnectService).plan(
      buildImportOutcome([
        { key: "a", kind: "existing", journalName: "daily", connect: true },
        { key: "b", kind: "existing", journalName: "daily", connect: true },
      ]),
    );

    expect(
      plan.rows.map((row) => ({
        journalName: row.journalName,
        actions: row.actions.map((action) => action.path),
        skips: row.skips,
      })),
    ).toEqual([{ journalName: "daily", actions: ["Journal/2026-06-01.md"], skips: [] }]);
  });

  it("connects a journal that two rows name when either row asks to", async () => {
    const harness = await harnessWith({ daily: daily("daily") });
    harness.host.putFile("Journal/2026-06-01.md");

    const plan = await harness.resolve(ImportConnectService).plan(
      buildImportOutcome([
        { key: "a", kind: "existing", journalName: "daily", connect: false },
        { key: "b", kind: "existing", journalName: "daily", connect: true },
      ]),
    );

    expect(plan.rows.map((row) => row.actions.length)).toEqual([1]);
  });

  it("does not plan a journal whose paths cannot be read back", async () => {
    const harness = await harnessWith({ daily: daily("daily", { nameTemplate: "{{date}}-{{mystery}}" }) });

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]));

    expect(plan.rows.at(0)).toMatchObject({ blocked: { kind: "non-invertible" }, actions: [] });
  });

  it("finds no notes, without failing, for a journal whose folder does not exist yet", async () => {
    const harness = await harnessWith({ daily: daily("daily", { folder: "Nowhere" }) });

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "created", journalName: "daily", connect: true }]));

    expect(plan.rows.at(0)).toEqual({ journalName: "daily", actions: [], skips: [] });
  });

  it("skips a note whose period already has one", async () => {
    const harness = await harnessWith({ daily: daily("daily") });
    harness
      .resolve(JournalsIndex)
      .register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "Inbox/first.md" as VaultPath });
    harness.host.putFile("Journal/2026-06-01.md");

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]));

    expect(plan.rows.at(0)?.skips).toEqual([{ path: "Journal/2026-06-01.md", reason: "period-has-note" }]);
  });

  it("connects the planned notes and counts them", async () => {
    const harness = await harnessWith({ daily: daily("daily") });
    harness.host.putFile("Journal/2026-06-01.md");
    const service = harness.resolve(ImportConnectService);
    const plan = await service.plan(
      buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: true }]),
    );

    const report = await service.apply(plan);

    expect({
      report: report.rows,
      frontmatter: harness.host.files.get("Journal/2026-06-01.md")?.frontmatter,
    }).toMatchObject({
      report: [{ journalName: "daily", connected: 1, failed: [] }],
      frontmatter: { journal: "daily" },
    });
  });

  it("leaves out a row whose connection is switched off", async () => {
    const harness = await harnessWith({ daily: daily("daily") });
    harness.host.putFile("Journal/2026-06-01.md");

    const plan = await harness
      .resolve(ImportConnectService)
      .plan(buildImportOutcome([{ key: "k", kind: "existing", journalName: "daily", connect: false }]));

    expect(plan.rows).toEqual([]);
  });
});
