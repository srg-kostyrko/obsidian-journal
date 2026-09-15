import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { calendarSettingsModule } from "@/calendar";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { journalsSettingsModule } from "@/journals/settings/module";
import { startupModule } from "@/journals/startup/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";
import { shelvesModule } from "@/shelves";
import { testContainer, type TestHarness } from "@/testing";

import { importCoreModule } from "../module";
import { importNoticeSlice } from "../settings/slice";
import { buildCalendarSet, buildPeriodicConfig, periodicNotesStorePlugin } from "../testing";

import ImportNoticeBlock from "./ImportNoticeBlock.vue";

const MODULES = [
  journalsCoreModule,
  journalsSettingsModule,
  calendarSettingsModule,
  startupModule,
  shelvesModule,
  importCoreModule,
];

async function harnessWith(data: NonNullable<Parameters<typeof testContainer>[0]>["data"] = {}): Promise<TestHarness> {
  return testContainer({ modules: MODULES, data });
}

function withPeriodicNotesDay(harness: TestHarness): void {
  harness.host.putPlugin(
    "periodic-notes",
    periodicNotesStorePlugin({
      calendarSets: [buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "Journal" }) })],
    }),
  );
}

describe("ImportNoticeBlock", () => {
  it("offers to import when a plugin can set up a journal", async () => {
    const harness = await harnessWith();
    withPeriodicNotesDay(harness);

    harness.render(ImportNoticeBlock);

    expect(
      await screen.findByText(m.import_notice_message({ sources: m.import_source_periodic_notes(), count: 1 })),
    ).toBeTruthy();
  });

  it("stays hidden when every journal is already set up", async () => {
    const harness = await harnessWith({
      journals: {
        days: fixedJournal(
          "days",
          { type: "day" },
          { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}" },
        ),
      },
    });
    withPeriodicNotesDay(harness);

    harness.render(ImportNoticeBlock);

    expect(screen.queryByText(m.import_notice_heading())).toBeNull();
  });

  it("stays hidden for Daily notes left at its defaults", async () => {
    const harness = await harnessWith();
    harness.host.putCorePlugin("daily-notes", { options: {} });

    harness.render(ImportNoticeBlock);

    expect(screen.queryByText(m.import_notice_heading())).toBeNull();
  });

  it("stays hidden once dismissed", async () => {
    const harness = await harnessWith({ importNotice: { dismissed: true } });
    withPeriodicNotesDay(harness);

    harness.render(ImportNoticeBlock);

    expect(screen.queryByText(m.import_notice_heading())).toBeNull();
  });

  it("remembers being dismissed", async () => {
    const harness = await harnessWith();
    withPeriodicNotesDay(harness);
    harness.render(ImportNoticeBlock);

    await userEvent.click(await screen.findByText(m.import_notice_dismiss()));

    expect(harness.resolve(SettingsService).getSlice(importNoticeSlice).state.dismissed).toBe(true);
  });

  it("disappears once the import has set everything up", async () => {
    const harness = await harnessWith();
    withPeriodicNotesDay(harness);
    vi.spyOn(harness.resolve(Flows), "invoke").mockImplementation(() => {
      const journals = harness.resolve(JournalsRepository);
      journals.create("days", { type: "day" });
      journals.update("days", { folder: "Journal", dateFormat: "YYYY-MM-DD", nameTemplate: "{{date}}" });
      return AsyncResult.ok(undefined);
    });
    harness.render(ImportNoticeBlock);

    await userEvent.click(await screen.findByText(m.import_action()));

    await vi.waitFor(() => expect(screen.queryByText(m.import_notice_heading())).toBeNull());
  });
});
