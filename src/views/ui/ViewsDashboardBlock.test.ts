import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { SettingsUiService } from "@/settings";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { DeleteViewFlow } from "../flows/delete-view.flow";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { buildView } from "../testing";
import { viewsUiModule } from "../ui-module";

import ViewsDashboardBlock from "./ViewsDashboardBlock.vue";

async function setup(views: Record<string, unknown> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, viewsUiModule],
    data: { views },
  });
  return { harness };
}

function mount(harness: TestHarness) {
  return harness.render(ViewsDashboardBlock);
}

describe("ViewsDashboardBlock", () => {
  it("shows the empty state when no views exist", async () => {
    const { harness } = await setup();
    mount(harness);
    await userEvent.click(screen.getByText(m.view_dashboard_section_title()));
    expect(screen.getByText(m.view_dashboard_empty())).toBeTruthy();
  });

  it("lists each view sorted by name", async () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    const { harness } = await setup({
      [id1]: buildView(id1, { name: "Zeta" }),
      [id2]: buildView(id2, { name: "Alpha" }),
    });
    mount(harness);
    await userEvent.click(screen.getByText(m.view_dashboard_section_title()));
    const names = screen.getAllByText(/Alpha|Zeta/).map((n) => n.textContent);
    expect(names).toEqual(["Alpha", "Zeta"]);
  });

  it("invokes EditViewNameFlow when add is clicked", async () => {
    const { harness } = await setup();
    mount(harness);
    const spy = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_add()));
    expect(spy).toHaveBeenCalledWith(EditViewNameFlow, {});
  });

  it("pushes the edit subpage when open is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { harness } = await setup({ [id]: buildView(id, { name: "Weekly" }) });
    mount(harness);
    const ui = harness.resolve(SettingsUiService);
    await userEvent.click(screen.getByText(m.view_dashboard_section_title()));
    await userEvent.click(screen.getByLabelText(m.view_dashboard_open({ name: "Weekly" })));
    expect(ui.current.value?.subpage.key).toBe("view-edit");
    expect(ui.current.value?.props).toEqual({ viewId: id });
  });

  it("clones the view when clone is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { harness } = await setup({ [id]: buildView(id, { name: "Weekly" }) });
    mount(harness);
    const repo = harness.resolve(ViewsRepository);
    await userEvent.click(screen.getByText(m.view_dashboard_section_title()));
    await userEvent.click(screen.getByLabelText(m.view_dashboard_clone({ name: "Weekly" })));
    expect([...repo.find().list()].map((v) => v.name)).toContain("Weekly (copy)");
  });

  it("invokes DeleteViewFlow when delete is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { harness } = await setup({ [id]: buildView(id, { name: "Weekly" }) });
    mount(harness);
    const spy = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByText(m.view_dashboard_section_title()));
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Weekly" })));
    expect(spy).toHaveBeenCalledWith(DeleteViewFlow, { viewId: id });
  });
});
