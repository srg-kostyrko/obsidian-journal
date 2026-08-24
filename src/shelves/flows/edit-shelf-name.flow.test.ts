import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { shelvesCoreModule } from "../module";
import { ShelvesRepository } from "../repository";
import { buildShelf } from "../testing";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";

describe("EditShelfNameFlow", () => {
  it("creates a shelf when no shelf name is given", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: { shelves: {} },
    });

    const promise = harness.resolve(Flows).invoke(EditShelfNameFlow, {});
    harness.modals.lastOpen<unknown, string>().submit("Work");
    await promise;

    expect(
      harness
        .resolve(ShelvesRepository)
        .get("Work")
        .getOr(undefined as never),
    ).toEqual(buildShelf("Work"));
  });

  it("renames an existing shelf and keeps its journals", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: { shelves: { Work: buildShelf("Work", { journals: ["daily"] }) } },
    });

    const promise = harness.resolve(Flows).invoke(EditShelfNameFlow, { shelfName: "Work" });
    harness.modals.lastOpen<unknown, string>().submit("Office");
    await promise;

    const repo = harness.resolve(ShelvesRepository);
    expect(repo.get("Work").isNone()).toBe(true);
    expect(repo.get("Office").getOr(undefined as never)).toEqual(buildShelf("Office", { journals: ["daily"] }));
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: { shelves: {} },
    });

    const promise = harness.resolve(Flows).invoke(EditShelfNameFlow, {});
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(harness.resolve(ShelvesRepository).count()).toBe(0);
  });
});
