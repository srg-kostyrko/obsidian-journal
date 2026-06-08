import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { PlaceJournalFlow } from "../flows/place-journal.flow";
import { ShelvesRepository } from "../repository";
import { ShelvesEventsToken } from "../tokens";
import { ShelvesViewModel } from "../view-model";

import JournalShelfSection from "./JournalShelfSection.vue";

afterEach(() => cleanup());

async function setup(shelves: Record<string, { name: string; journals: string[] }> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [shelvesCollection],
    raw: { version: 4, shelves },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ShelvesViewModel).useClass(ShelvesViewModel);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container, journalName: string) {
  return render(JournalShelfSection, {
    props: { journalName },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("JournalShelfSection", () => {
  it("shows the not-on-a-shelf message when the journal is unassigned", async () => {
    const { container } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.common_label_shelf()));
    expect(screen.getByText(m.shelf_section_not_on_shelf())).toBeTruthy();
  });

  it("shows the current shelf when the journal is on one", async () => {
    const { container } = await setup({ Work: { name: "Work", journals: ["daily"] } });
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.common_label_shelf()));
    expect(screen.getByText("Work")).toBeTruthy();
  });

  it("invokes PlaceJournalFlow when the place button is clicked", async () => {
    const { container, flows } = await setup({ Work: { name: "Work", journals: [] } });
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.common_label_shelf()));
    await userEvent.click(screen.getByLabelText(m.shelf_section_place_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(PlaceJournalFlow, { journalName: "daily" });
  });
});
