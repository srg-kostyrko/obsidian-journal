import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";

import { DeleteShelfFlow } from "./delete-shelf.flow";
import { EditShelfNameFlow } from "./edit-shelf-name.flow";
import { shelfEditSubpage } from "./shelf-edit-subpage";
import ShelvesDashboardBlock from "./ShelvesDashboardBlock.vue";

afterEach(() => cleanup());

async function setup(shelves: Record<string, { name: string; journals: string[] }> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [shelvesCollection],
    raw: { version: 3, shelves },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(SubpageToken).useValue(shelfEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
  return { container, flows, ui: container.resolve(SettingsUiService) };
}

function mount(container: Container) {
  return render(ShelvesDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ShelvesDashboardBlock", () => {
  it("shows the empty state when no shelves exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.shelf_dashboard_empty())).toBeTruthy();
  });

  it("lists each shelf with its member count", async () => {
    const { container } = await setup({ Work: { name: "Work", journals: ["daily", "weekly"] } });
    mount(container);
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText(m.shelf_member_count({ count: 2 }))).toBeTruthy();
  });

  it("invokes EditShelfNameFlow when the add button is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, {});
  });

  it("opens the shelf-detail subpage when the organize button is clicked", async () => {
    const { container, ui } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_open({ name: "Work" })));
    expect(ui.current.value?.subpage.key).toBe("shelf-edit");
    expect(ui.current.value?.props).toEqual({ shelfName: "Work" });
  });

  it("invokes DeleteShelfFlow when the delete button is clicked", async () => {
    const { container, flows } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container);
    await userEvent.click(screen.getByLabelText(m.shelf_dashboard_delete({ name: "Work" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteShelfFlow, { shelfName: "Work" });
  });
});
