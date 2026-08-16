import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { journalConfigCollection } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";
import { DeleteCommandFlow } from "../flows/delete-command.flow";
import { EditCommandFlow } from "../flows/edit-command.flow";
import { CommandsRepository } from "../repository";
import { CommandsEventsToken } from "../tokens";

import JournalCommandsSection from "./JournalCommandsSection.vue";

afterEach(() => cleanup());

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

function makeConfig(name: string, target: CommandConfig["target"]): CommandConfig {
  return { name, icon: "", showInRibbon: false, openMode: "active", target, type: "same", context: "today" };
}

async function setup(commands: Record<string, CommandConfig> = {}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection, journalConfigCollection],
    raw: { version: 5, commands, journals: { daily: makeJournal("daily") } },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  container.register(CommandsEventsToken).useFactory(() => createNanoEvents());
  container.register(CommandsRepository).useClass(CommandsRepository);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows };
}

function mount(container: Container) {
  return render(JournalCommandsSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("JournalCommandsSection", () => {
  it("lists only this journal's commands", async () => {
    const { container } = await setup({
      "c-1": makeConfig("Mine", { kind: "journal", journalName: "daily" }),
      "c-2": makeConfig("Other journal", { kind: "journal", journalName: "weekly" }),
      "c-3": makeConfig("Global", { kind: "all", writeType: "day" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_section_title()));
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Other journal")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("invokes EditCommandFlow with a journal target when add is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.command_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "journal", journalName: "daily" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.command_edit_tooltip({ name: "Mine" })));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { container, flows } = await setup({
      "c-1": makeConfig("Mine", { kind: "journal", journalName: "daily" }),
    });
    mount(container);
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Mine" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
