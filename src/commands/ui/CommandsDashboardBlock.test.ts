import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { DeleteCommandFlow } from "../flows/delete-command.flow";
import { EditCommandFlow } from "../flows/edit-command.flow";
import { commandsCoreModule } from "../module";
import { buildCommand } from "../testing";

import CommandsDashboardBlock from "./CommandsDashboardBlock.vue";

import type { CommandConfig } from "../config";

async function setup(commands: Record<string, CommandConfig> = {}) {
  const harness = await testContainer({ modules: [commandsCoreModule], data: { commands } });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { harness, flows };
}

describe("CommandsDashboardBlock", () => {
  it("shows the empty state when no global commands exist", async () => {
    const { harness } = await setup();
    harness.render(CommandsDashboardBlock);
    await userEvent.click(screen.getByText(m.command_section_title()));
    expect(screen.getByText(m.command_empty({ scope: "global" }))).toBeTruthy();
  });

  it("lists only all-target commands", async () => {
    const { harness } = await setup({
      "c-1": buildCommand({ name: "Global one", target: { kind: "all", writeType: "day" } }),
      "c-2": buildCommand({ name: "Journal one", target: { kind: "journal", journalName: "daily" } }),
    });
    harness.render(CommandsDashboardBlock);
    await userEvent.click(screen.getByText(m.command_section_title()));
    expect(screen.getByText("Global one")).toBeTruthy();
    expect(screen.queryByText("Journal one")).toBeNull();
  });

  it("invokes EditCommandFlow with an all target when add is clicked", async () => {
    const { harness, flows } = await setup();
    harness.render(CommandsDashboardBlock);
    await userEvent.click(screen.getByLabelText(m.command_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "all", writeType: "day" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { harness, flows } = await setup({
      "c-1": buildCommand({ name: "Global one", target: { kind: "all", writeType: "day" } }),
    });
    harness.render(CommandsDashboardBlock);
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.command_edit_tooltip({ name: "Global one" })));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "all", writeType: "day" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { harness, flows } = await setup({
      "c-1": buildCommand({ name: "Global one", target: { kind: "all", writeType: "day" } }),
    });
    harness.render(CommandsDashboardBlock);
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Global one" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
