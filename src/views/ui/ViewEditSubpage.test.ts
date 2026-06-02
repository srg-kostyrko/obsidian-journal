import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesEventsToken, ShelvesRepository, ShelvesViewModel, shelvesCollection } from "@/shelves";

import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import ViewEditSubpage from "./ViewEditSubpage.vue";

import type { ViewId } from "../config";

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

async function setup() {
  const raw = {
    version: 4,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: null,
        showInRibbon: false,
        blocks: [],
      },
    },
    shelves: { Personal: { name: "Personal", journals: [] } },
  };
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(ShelvesViewModel).useClass(ShelvesViewModel);
  container.register(Flows).useClass(Flows);
  return { container };
}

function makeNav() {
  return { back: vi.fn(), push: vi.fn() };
}

function mount(container: Container, nav = makeNav()) {
  const result = render(ViewEditSubpage, {
    props: { viewId, nav },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
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
    const { container } = await setup();
    const { nav } = mount(container);
    const repo = container.resolve(ViewsRepository);
    repo.delete(viewId);
    await nextTick();
    expect(nav.back).toHaveBeenCalled();
  });

  it("toggles showInRibbon", async () => {
    const { container } = await setup();
    mount(container);
    const repo = container.resolve(ViewsRepository);
    const toggle = within(row(m.view_edit_show_in_ribbon_label())).getByRole("checkbox");
    await userEvent.click(toggle);
    expect(repo.get(viewId).getOr(undefined as never)?.showInRibbon).toBe(true);
  });

  it("updates the default shelf when changed", async () => {
    const { container } = await setup();
    mount(container);
    const repo = container.resolve(ViewsRepository);
    const dropdown = within(row(m.view_edit_default_shelf_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "Personal");
    expect(repo.get(viewId).getOr(undefined as never)?.defaultShelf).toBe("Personal");
  });

  it("updates the leaf placement when the Open-in dropdown changes", async () => {
    const { container } = await setup();
    mount(container);
    const repo = container.resolve(ViewsRepository);
    const dropdown = within(row(m.view_edit_leaf_label())).getByRole("combobox");
    await userEvent.selectOptions(dropdown, "left");
    expect(repo.get(viewId).getOr(undefined as never)?.leaf).toBe("left");
  });
});
