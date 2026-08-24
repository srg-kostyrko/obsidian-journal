import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { shelvesCoreModule } from "../module";
import { ShelvesRepository } from "../repository";
import { buildShelf } from "../testing";

import { DeleteShelfFlow } from "./delete-shelf.flow";

describe("DeleteShelfFlow", () => {
  it("removes the shelf and moves its journals to the chosen destination", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: {
        shelves: {
          Work: buildShelf("Work", { journals: ["daily"] }),
          Personal: buildShelf("Personal"),
        },
      },
    });

    const promise = harness.resolve(Flows).invoke(DeleteShelfFlow, { shelfName: "Work" });
    harness.modals.lastOpen<unknown, string>().submit("Personal");
    await promise;

    const repo = harness.resolve(ShelvesRepository);
    expect(repo.get("Work").isNone()).toBe(true);
    expect(repo.get("Personal").getOr(undefined as never)?.journals).toEqual(["daily"]);
  });

  it("leaves the shelf in place when the modal is cancelled", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: { shelves: { Work: buildShelf("Work") } },
    });

    const promise = harness.resolve(Flows).invoke(DeleteShelfFlow, { shelfName: "Work" });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(harness.resolve(ShelvesRepository).get("Work").isSome()).toBe(true);
  });
});
