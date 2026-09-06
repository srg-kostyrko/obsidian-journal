import { beforeEach, describe, expect, it } from "vitest";

import { commandsCoreModule } from "@/commands/module";
import { CommandsRepository } from "@/commands/repository";
import { buildCommand } from "@/commands/testing";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { buildNoteletType } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { NoteletCommandService } from "./notelet-commands";

import type { TypeId } from "./config";

describe("NoteletCommandService", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, commandsCoreModule],
      data: { journals: {}, commands: {} },
    });
  });

  function commands(): ReturnType<typeof buildCommand>[] {
    return [...harness.resolve(CommandsRepository).find().entries()].map(([, command]) => command);
  }

  describe("seed", () => {
    it("creates the type's command with its documented shape", () => {
      harness.resolve(NoteletCommandService).seed("daily", buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }));

      expect(commands()).toEqual([
        expect.objectContaining({
          name: m.journal_notelet_command_name({ type: "Standup" }),
          icon: "",
          showInRibbon: false,
          openMode: "tab",
          target: { kind: "notelet", journalName: "daily", typeId: "nt_1" },
          type: "same",
          context: "today",
        }),
      ]);
    });

    it("claims no ribbon icon, so seeding never puts a button on the ribbon", () => {
      harness.resolve(NoteletCommandService).seed("daily", buildNoteletType({ id: "nt_1" as TypeId }));

      expect(commands().at(0)?.showInRibbon).toBe(false);
      expect(commands().at(0)?.icon).toBe("");
    });
  });

  describe("retire", () => {
    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, commandsCoreModule],
        data: {
          journals: {},
          commands: {
            "cmd-1": buildCommand({ target: { kind: "notelet", journalName: "daily", typeId: "nt_1" } }),
            "cmd-2": buildCommand({ target: { kind: "notelet", journalName: "daily", typeId: "nt_2" } }),
            "cmd-3": buildCommand({ target: { kind: "notelet", journalName: "weekly", typeId: "nt_1" } }),
            "cmd-4": buildCommand({ target: { kind: "journal", journalName: "daily" } }),
          },
        },
      });
    });

    it("deletes the type's own command", () => {
      harness.resolve(NoteletCommandService).retire("daily", "nt_1" as TypeId);

      expect(harness.resolve(CommandsRepository).get("cmd-1").isNone()).toBe(true);
    });

    it("leaves another type's command in the same journal", () => {
      harness.resolve(NoteletCommandService).retire("daily", "nt_1" as TypeId);

      expect(harness.resolve(CommandsRepository).get("cmd-2").isSome()).toBe(true);
    });

    it("leaves another journal's command whose type shares the id", () => {
      harness.resolve(NoteletCommandService).retire("daily", "nt_1" as TypeId);

      expect(harness.resolve(CommandsRepository).get("cmd-3").isSome()).toBe(true);
    });

    it("leaves the journal's own command alone", () => {
      harness.resolve(NoteletCommandService).retire("daily", "nt_1" as TypeId);

      expect(harness.resolve(CommandsRepository).get("cmd-4").isSome()).toBe(true);
    });
  });
});
