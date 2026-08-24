import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { SettingsUiService } from "@/settings";
import { testContainer } from "@/testing";

import { DeleteShelfFlow } from "../flows/delete-shelf.flow";
import { EditShelfNameFlow } from "../flows/edit-shelf-name.flow";
import { shelvesCoreModule } from "../module";
import { buildShelf } from "../testing";
import { shelvesUiModule } from "../ui-module";

import ShelvesDashboardBlock from "./ShelvesDashboardBlock.vue";

import type { ShelfConfig } from "../config";

async function setup(shelves: Record<string, ShelfConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, shelvesUiModule],
    data: { shelves },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
  return { harness, flows, ui: harness.resolve(SettingsUiService) };
}

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.shelf_dashboard_section_title()));
}

describe("ShelvesDashboardBlock", () => {
  it("explains what a shelf is even once shelves exist", async () => {
    const { harness } = await setup({ Work: buildShelf("Work", { journals: ["daily"] }) });
    harness.render(ShelvesDashboardBlock);
    expect(screen.getByText(m.shelf_dashboard_description())).toBeTruthy();
  });

  it("starts collapsed when no shelves exist", async () => {
    const { harness } = await setup();
    harness.render(ShelvesDashboardBlock);
    expect(screen.queryByText(m.shelf_dashboard_description())).toBeNull();
  });

  it("shows the empty state when no shelves exist", async () => {
    const { harness } = await setup();
    harness.render(ShelvesDashboardBlock);
    await expand();
    expect(screen.getByText(m.shelf_dashboard_empty())).toBeTruthy();
  });

  it("lists each shelf with its member count", async () => {
    const { harness } = await setup({ Work: buildShelf("Work", { journals: ["daily", "weekly"] }) });
    harness.render(ShelvesDashboardBlock);
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText(m.shelf_member_count({ count: 2 }))).toBeTruthy();
  });

  it("invokes EditShelfNameFlow when the add button is clicked", async () => {
    const { harness, flows } = await setup();
    harness.render(ShelvesDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.shelf_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, {});
  });

  it("opens the shelf-detail subpage when the organize button is clicked", async () => {
    const { harness, ui } = await setup({ Work: buildShelf("Work") });
    harness.render(ShelvesDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_open({ name: "Work" })));
    expect(ui.current.value?.subpage.key).toBe("shelf-edit");
    expect(ui.current.value?.props).toEqual({ shelfName: "Work" });
  });

  it("invokes DeleteShelfFlow when the delete button is clicked", async () => {
    const { harness, flows } = await setup({ Work: buildShelf("Work") });
    harness.render(ShelvesDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Work" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteShelfFlow, { shelfName: "Work" });
  });
});
