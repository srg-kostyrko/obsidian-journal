import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { AddBlockToViewFlow } from "../flows/add-block-to-view.flow";
import { RepositionViewFlow } from "../flows/reposition-view.flow";
import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { viewsStartupModule } from "../startup-module";
import { buildView } from "../testing";
import { ViewHostService } from "../view-host";

import ViewEditSubpage from "./ViewEditSubpage.vue";

import type { View, ViewId } from "../config";

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

async function setup(viewOverrides: Partial<View> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, viewsStartupModule],
    data: {
      views: { [viewId]: buildView(viewId, { name: "Weekly", ...viewOverrides }) },
      shelves: { Personal: buildShelf("Personal") },
    },
    allow: { hostState: true },
  });
  const open = vi.spyOn(harness.resolve(ViewHostService), "open").mockResolvedValue(undefined);
  return { harness, open };
}

function makeNav() {
  return { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
}

function mount(harness: TestHarness, nav = makeNav()) {
  const result = harness.render(ViewEditSubpage, { props: { viewId, nav } });
  return { ...result, nav };
}

function row(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const found = heading.closest(".setting-item");
  if (!found) throw new Error(`row not found for label: ${label}`);
  return found as HTMLElement;
}

describe("ViewEditSubpage", () => {
  it("calls nav.back when the view disappears", async () => {
    const { harness } = await setup();
    const { nav } = mount(harness);
    const repo = harness.resolve(ViewsRepository);
    repo.delete(viewId);
    await nextTick();
    expect(nav.back).toHaveBeenCalled();
  });

  it("calls nav.back when the back breadcrumb is clicked", async () => {
    const { harness } = await setup();
    const { nav } = mount(harness);
    await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));
    expect(nav.back).toHaveBeenCalled();
  });

  it("toggles showInRibbon", async () => {
    const { harness } = await setup();
    mount(harness);
    const repo = harness.resolve(ViewsRepository);
    const toggle = within(row(m.common_show_in_ribbon())).getByRole("checkbox");
    await userEvent.click(toggle);
    expect(repo.get(viewId).getOr(undefined as never)?.showInRibbon).toBe(true);
  });

  it("updates the default shelf when changed", async () => {
    const { harness } = await setup();
    mount(harness);
    const repo = harness.resolve(ViewsRepository);
    const dropdown = within(row(m.view_edit_default_shelf_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "Personal");
    expect(repo.get(viewId).getOr(undefined as never)?.defaultShelf).toBe("Personal");
  });

  it("updates the leaf placement when the Open-in dropdown changes", async () => {
    const { harness } = await setup();
    mount(harness);
    const repo = harness.resolve(ViewsRepository);
    const dropdown = within(row(m.view_edit_leaf_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "left");
    expect(repo.get(viewId).getOr(undefined as never)?.leaf).toBe("left");
  });

  it("persists openOnStartup when the toggle is switched on", async () => {
    const { harness } = await setup();
    mount(harness);
    const repo = harness.resolve(ViewsRepository);
    const toggle = within(row(m.view_edit_open_on_startup_label())).getByRole("checkbox");
    await userEvent.click(toggle);
    expect(repo.get(viewId).getOr(undefined as never)?.openOnStartup).toBe(true);
  });

  it("opens the view immediately when the toggle is switched on", async () => {
    const { harness, open } = await setup();
    mount(harness);
    const toggle = within(row(m.view_edit_open_on_startup_label())).getByRole("checkbox");
    await userEvent.click(toggle);
    expect(open).toHaveBeenCalledWith(viewId);
  });

  it("does not open the view when the toggle is switched off", async () => {
    const { harness, open } = await setup({ openOnStartup: true });
    mount(harness);
    const toggle = within(row(m.view_edit_open_on_startup_label())).getByRole("checkbox");
    await userEvent.click(toggle);
    expect(open).not.toHaveBeenCalled();
  });

  it("invokes the reposition flow after the open-in dropdown changes", async () => {
    const { harness } = await setup();
    mount(harness);
    const spy = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({ tap: () => undefined } as never);
    const dropdown = within(row(m.view_edit_leaf_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "left");
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(RepositionViewFlow, { viewId }));
  });

  it("invokes AddBlockToViewFlow from the blocks header control", async () => {
    const { harness } = await setup();
    mount(harness);
    const spy = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByLabelText(m.view_add_block()));
    expect(spy).toHaveBeenCalledWith(AddBlockToViewFlow, { viewId });
  });
});
