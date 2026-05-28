import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { DeleteViewFlow } from "../flows/delete-view.flow";
import { EditViewNameFlow } from "../flows/edit-view-name.flow";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import { viewEditSubpage } from "./view-edit-subpage";
import ViewsDashboardBlock from "./ViewsDashboardBlock.vue";

afterEach(() => cleanup());

async function setup(views: Record<string, unknown> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection],
    raw: { version: 3, views },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(SubpageToken).useValue(viewEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  return { container };
}

function mount(container: Container) {
  return render(ViewsDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const makeView = (id: string, name: string) => ({
  id,
  name,
  icon: "calendar-days",
  defaultShelf: null,
  showInRibbon: false,
  blocks: [],
});

describe("ViewsDashboardBlock", () => {
  it("shows the empty state when no views exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.view_dashboard_empty())).toBeTruthy();
  });

  it("lists each view sorted by name", async () => {
    const id1 = "11111111-1111-1111-1111-111111111111";
    const id2 = "22222222-2222-2222-2222-222222222222";
    const { container } = await setup({ [id1]: makeView(id1, "Zeta"), [id2]: makeView(id2, "Alpha") });
    mount(container);
    const names = screen.getAllByText(/Alpha|Zeta/).map((n) => n.textContent);
    expect(names).toEqual(["Alpha", "Zeta"]);
  });

  it("invokes EditViewNameFlow when add is clicked", async () => {
    const { container } = await setup();
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_add()));
    expect(spy).toHaveBeenCalledWith(EditViewNameFlow, {});
  });

  it("pushes the edit subpage when open is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { container } = await setup({ [id]: makeView(id, "Weekly") });
    mount(container);
    const ui = container.resolve(SettingsUiService);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_open({ name: "Weekly" })));
    expect(ui.current.value?.subpage.key).toBe("view-edit");
    expect(ui.current.value?.props).toEqual({ viewId: id });
  });

  it("clones the view when clone is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { container } = await setup({ [id]: makeView(id, "Weekly") });
    mount(container);
    const repo = container.resolve(ViewsRepository);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_clone({ name: "Weekly" })));
    expect([...repo.find().list()].map((v) => v.name)).toContain("Weekly (copy)");
  });

  it("invokes DeleteViewFlow when delete is clicked", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const { container } = await setup({ [id]: makeView(id, "Weekly") });
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByLabelText(m.view_dashboard_delete({ name: "Weekly" })));
    expect(spy).toHaveBeenCalledWith(DeleteViewFlow, { viewId: id });
  });
});
