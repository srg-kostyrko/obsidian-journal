import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { commandsCoreModule } from "../module";
import { buildCommand } from "../testing";

import NoteletCommandsSection from "./NoteletCommandsSection.vue";

import type { CommandConfig } from "../config";

function seed(commands: Record<string, CommandConfig> = {}) {
  return {
    journals: {
      Work: fixedJournal(
        "Work",
        { type: "day" },
        { notelets: { nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup" }) } },
      ),
    },
    commands,
  };
}

describe("NoteletCommandsSection", () => {
  it("lists only this type's commands", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, commandsCoreModule],
      data: seed({
        c1: buildCommand({ name: "New standup", target: { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" } }),
        c2: buildCommand({ name: "New 1:1", target: { kind: "notelet", journalName: "Work", typeId: "nt_91bc" } }),
        c3: buildCommand({ name: "Open today", target: { kind: "journal", journalName: "Work" } }),
      }),
    });

    harness.render(NoteletCommandsSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });
    await userEvent.click(screen.getByText(m.command_section_title()));

    expect(screen.getByText("New standup")).toBeTruthy();
    expect(screen.queryByText("New 1:1")).toBeNull();
    expect(screen.queryByText("Open today")).toBeNull();
  });

  it("adds a command targeting this type", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, commandsCoreModule],
      data: seed(),
    });

    harness.render(NoteletCommandsSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });
    await userEvent.click(screen.getByRole("button", { name: m.command_add() }));

    expect(harness.modals.lastOpen().props).toMatchObject({
      target: { kind: "notelet", journalName: "Work", typeId: "nt_7f3a" },
    });
  });

  it("shows the notelet empty state when there are no commands", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, commandsCoreModule],
      data: seed(),
    });

    harness.render(NoteletCommandsSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });
    await userEvent.click(screen.getByText(m.command_section_title()));

    expect(screen.getByText(m.command_empty({ scope: "notelet" }))).toBeTruthy();
  });
});
