import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";
import { shelvesCollection } from "@/shelves";

import { commandCollection, type CommandConfig } from "../config";

import { DeleteCommandFlow } from "./delete-command.flow";
import { EditCommandFlow } from "./edit-command.flow";
import ShelfCommandsSection from "./ShelfCommandsSection.vue";

afterEach(() => cleanup());

function makeConfig(name: string, target: CommandConfig["target"]): CommandConfig {
  return { name, icon: "", showInRibbon: false, openMode: "active", target, type: "same", context: "today" };
}

async function setup(commands: Record<string, CommandConfig> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection, shelvesCollection],
    raw: { version: 3, commands, shelves: { work: { name: "work", journals: [] } } },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container) {
  return render(ShelfCommandsSection, {
    props: { shelfName: "work" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ShelfCommandsSection", () => {
  it("lists only this shelf's commands", async () => {
    const { container } = await setup({
      "c-1": makeConfig("Mine", { kind: "shelf", shelfName: "work", writeType: "day" }),
      "c-2": makeConfig("Other shelf", { kind: "shelf", shelfName: "home", writeType: "day" }),
      "c-3": makeConfig("Global", { kind: "all", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_shelf_section_title()));
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Other shelf")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("invokes EditCommandFlow with a shelf target when add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.command_shelf_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "shelf", shelfName: "work", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_shelf_section_title()));
    await userEvent.click(screen.getByLabelText(`${m.command_list_edit()} Mine`));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "shelf", shelfName: "work", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_shelf_section_title()));
    await userEvent.click(screen.getByLabelText(`${m.command_list_delete()} Mine`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
