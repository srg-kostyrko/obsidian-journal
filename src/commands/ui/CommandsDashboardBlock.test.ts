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

import { commandCollection, type CommandConfig } from "../config";
import { DeleteCommandFlow } from "../flows/delete-command.flow";
import { EditCommandFlow } from "../flows/edit-command.flow";
import { CommandsRepository } from "../repository";
import { CommandsEventsToken } from "../tokens";

import CommandsDashboardBlock from "./CommandsDashboardBlock.vue";

afterEach(() => cleanup());

function makeConfig(name: string, kind: "all" | "journal"): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: kind === "all" ? { kind: "all", writeType: "day" } : { kind: "journal", journalName: "daily" },
    type: "same",
    context: "today",
  };
}

async function setup(commands: Record<string, CommandConfig> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection],
    raw: { version: 3, commands },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(CommandsEventsToken).useFactory(() => createNanoEvents());
  container.register(CommandsRepository).useClass(CommandsRepository);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container) {
  return render(CommandsDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("CommandsDashboardBlock", () => {
  it("shows the empty state when no global commands exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.command_dashboard_empty())).toBeTruthy();
  });

  it("lists only all-target commands", async () => {
    const { container } = await setup({
      "c-1": makeConfig("Global one", "all"),
      "c-2": makeConfig("Journal one", "journal"),
    });
    mount(container);
    expect(screen.getByText("Global one")).toBeTruthy();
    expect(screen.queryByText("Journal one")).toBeNull();
  });

  it("invokes EditCommandFlow with an all target when add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.command_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "all", writeType: "day" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { container, flows } = await setup({ "c-1": makeConfig("Global one", "all") });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.command_list_edit()} Global one`));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "all", writeType: "day" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { container, flows } = await setup({ "c-1": makeConfig("Global one", "all") });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.command_list_delete()} Global one`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
