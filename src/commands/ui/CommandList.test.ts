import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";

import CommandList from "./CommandList.vue";

import type { CommandConfig } from "../config";

afterEach(() => cleanup());

function makeCommand(name: string): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
  };
}

describe("CommandList", () => {
  it("shows the empty-state text when there are no entries", () => {
    render(CommandList, { props: { entries: [], emptyText: "nothing here" } });
    expect(screen.getByText("nothing here")).toBeTruthy();
  });

  it("renders a row per command with its name", () => {
    render(CommandList, {
      props: { entries: [["id-1", makeCommand("Open daily"), "day"]], emptyText: "x" },
    });
    expect(screen.getByText("Open daily")).toBeTruthy();
  });

  it("emits edit with the command id when the edit button is clicked", async () => {
    const { emitted } = render(CommandList, {
      props: { entries: [["id-1", makeCommand("Open daily"), "day"]], emptyText: "x" },
    });
    await userEvent.click(screen.getByLabelText(`${m.command_edit()} Open daily`));
    expect(emitted().edit).toEqual([["id-1"]]);
  });

  it("emits delete with the command id when the delete button is clicked", async () => {
    const { emitted } = render(CommandList, {
      props: { entries: [["id-1", makeCommand("Open daily"), "day"]], emptyText: "x" },
    });
    await userEvent.click(screen.getByLabelText(`${m.command_delete()} Open daily`));
    expect(emitted().delete).toEqual([["id-1"]]);
  });
});
