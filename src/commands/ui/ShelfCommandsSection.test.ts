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

import ShelfCommandsSection from "./ShelfCommandsSection.vue";

import type { CommandConfig } from "../config";

async function setup(commands: Record<string, CommandConfig> = {}) {
  const harness = await testContainer({ modules: [commandsCoreModule], data: { commands } });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { harness, flows };
}

describe("ShelfCommandsSection", () => {
  it("lists only this shelf's commands", async () => {
    const { harness } = await setup({
      "c-1": buildCommand({ name: "Mine", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
      "c-2": buildCommand({ name: "Other shelf", target: { kind: "shelf", shelfName: "home", writeType: "day" } }),
      "c-3": buildCommand({ name: "Global", target: { kind: "all", writeType: "day" } }),
    });
    harness.render(ShelfCommandsSection, { props: { shelfName: "work" } });
    await userEvent.click(screen.getByText(m.command_section_title()));
    expect(screen.getByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Other shelf")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("invokes EditCommandFlow with a shelf target when add is clicked", async () => {
    const { harness, flows } = await setup();
    harness.render(ShelfCommandsSection, { props: { shelfName: "work" } });
    await userEvent.click(screen.getByLabelText(m.command_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
    });
  });

  it("invokes EditCommandFlow with the command id when edit is clicked", async () => {
    const { harness, flows } = await setup({
      "c-1": buildCommand({ name: "Mine", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    });
    harness.render(ShelfCommandsSection, { props: { shelfName: "work" } });
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.command_edit_tooltip({ name: "Mine" })));
    expect(flows.invoke).toHaveBeenCalledWith(EditCommandFlow, {
      commandId: "c-1",
      target: { kind: "shelf", shelfName: "work", writeType: "day" },
    });
  });

  it("invokes DeleteCommandFlow when delete is clicked", async () => {
    const { harness, flows } = await setup({
      "c-1": buildCommand({ name: "Mine", target: { kind: "shelf", shelfName: "work", writeType: "day" } }),
    });
    harness.render(ShelfCommandsSection, { props: { shelfName: "work" } });
    await userEvent.click(screen.getByText(m.command_section_title()));
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Mine" })));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteCommandFlow, { commandId: "c-1" });
  });
});
