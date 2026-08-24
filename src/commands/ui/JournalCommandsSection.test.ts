import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { DeleteCommandFlow } from "../flows/delete-command.flow";
import { EditCommandFlow } from "../flows/edit-command.flow";
import { commandsCoreModule } from "../module";
import { buildCommand } from "../testing";

import JournalCommandsSection from "./JournalCommandsSection.vue";

import type { CommandConfig } from "../config";

async function setup(commands: Record<string, CommandConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, commandsCoreModule],
    data: { journals: { daily: fixedJournal("daily", { type: "day" }) }, commands },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { harness, flows };
}

describe("JournalCommandsSection", () => {
  it("lists only this journal's commands", async () => {
    const { harness } = await setup({
      "c-1": buildCommand({ name: "Mine", target: { kind: "journal", journalName: "daily" } }),
      "c-2": buildCommand({ name: "Other journal", target: { kind: "journal", journalName: "weekly" } }),
      "c-3": buildCommand({ name: "Global", target: { kind: "all", writeType: "day" } }),
    });
    harness.render(JournalCommandsSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.command_section_title()));
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Other journal")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("invokes EditCommandFlow with a journal target when add is clicked", async () => {
    const { harness, flows } = await setup();
    harness.render(JournalCommandsSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByLabelText(m.command_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { harness, flows } = await setup({
      "c-1": buildCommand({ name: "Mine", target: { kind: "journal", journalName: "daily" } }),
    });
    harness.render(JournalCommandsSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.command_edit_tooltip({ name: "Mine" })));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { harness, flows } = await setup({
      "c-1": buildCommand({ name: "Mine", target: { kind: "journal", journalName: "daily" } }),
    });
    harness.render(JournalCommandsSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Mine" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
