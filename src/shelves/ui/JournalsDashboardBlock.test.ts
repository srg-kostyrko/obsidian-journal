import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AddJournalFlow, DeleteJournalFlow, CloneJournalFlow, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { journalsSettingsUiModule } from "@/journals/settings/ui-module";
import { fixedJournal } from "@/journals/testing";
import { SettingsUiService } from "@/settings";
import { testContainer } from "@/testing";

import { shelvesCoreModule } from "../module";
import { buildShelf } from "../testing";

import JournalsDashboardBlock from "./JournalsDashboardBlock.vue";

import type { ShelfConfig } from "../config";

async function setup(options: { journals?: Record<string, JournalConfig>; shelves?: Record<string, ShelfConfig> }) {
  const harness = await testContainer({
    modules: [journalsCoreModule, journalsSettingsUiModule, shelvesCoreModule],
    data: { journals: options.journals ?? {}, shelves: options.shelves ?? {} },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { harness, flows, ui: harness.resolve(SettingsUiService) };
}

describe("JournalsDashboardBlock", () => {
  it("lists only journals not on any shelf", async () => {
    const { harness } = await setup({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
      },
      shelves: { Work: buildShelf("Work", { journals: ["weekly"] }) },
    });
    harness.render(JournalsDashboardBlock);
    expect(screen.getByLabelText(m.journal_dashboard_edit({ name: "daily" }))).toBeTruthy();
    expect(screen.queryByText("weekly")).toBeNull();
  });

  it("uses the plain title when no shelves exist", async () => {
    const { harness } = await setup({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.render(JournalsDashboardBlock);
    expect(screen.getByText(m.common_label_journals())).toBeTruthy();
  });

  it("uses the not-on-a-shelf title once a shelf exists", async () => {
    const { harness } = await setup({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { Work: buildShelf("Work") },
    });
    harness.render(JournalsDashboardBlock);
    expect(screen.getByText(m.shelf_journals_block_title_filtered())).toBeTruthy();
  });

  it("invokes AddJournalFlow when the add button is clicked", async () => {
    const { harness, flows } = await setup({});
    harness.render(JournalsDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.journal_create()));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });

  it("pushes the journal-edit subpage when Edit is clicked", async () => {
    const { harness, ui } = await setup({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.render(JournalsDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_edit({ name: "daily" })));
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("invokes DeleteJournalFlow when Delete is clicked", async () => {
    const { harness, flows } = await setup({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.render(JournalsDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "daily" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteJournalFlow, { journalName: "daily" });
  });

  it("invokes BulkAddFlow when bulk-add is clicked", async () => {
    const { harness, flows } = await setup({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.render(JournalsDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_bulk_add({ name: "daily" })));
    expect(flows.invoke).toHaveBeenCalledWith(BulkAddFlow, { journalName: "daily" });
  });

  it("invokes CloneJournalFlow when clone is clicked", async () => {
    const { harness, flows } = await setup({ journals: { daily: fixedJournal("daily", { type: "day" }) } });
    harness.render(JournalsDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_clone({ name: "daily" })));
    expect(flows.invoke).toHaveBeenCalledWith(CloneJournalFlow, { journalName: "daily" });
  });
});
