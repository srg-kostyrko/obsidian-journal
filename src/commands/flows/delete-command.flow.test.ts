import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { commandsCoreModule } from "../module";
import { CommandsRepository } from "../repository";
import { buildCommand } from "../testing";

import { DeleteCommandFlow } from "./delete-command.flow";

async function build() {
  const harness = await testContainer({
    modules: [commandsCoreModule],
    data: { commands: { "cmd-1": buildCommand({ name: "Doomed" }) } },
  });
  return {
    repo: harness.resolve(CommandsRepository),
    modals: harness.modals,
    flows: harness.resolve(Flows),
  };
}

describe("DeleteCommandFlow", () => {
  it("removes the command from the collection on confirm", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteCommandFlow, { commandId: "cmd-1" });
    modals.lastOpen<{ commandName: string }, void>().submit();
    await promise;
    expect(repo.get("cmd-1").isNone()).toBe(true);
  });

  it("leaves the command in place when cancelled", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteCommandFlow, { commandId: "cmd-1" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-command-modal");
    expect(repo.get("cmd-1").isSome()).toBe(true);
  });
});
