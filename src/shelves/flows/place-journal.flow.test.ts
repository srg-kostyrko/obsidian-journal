import { beforeEach, describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { shelvesCoreModule } from "../module";
import { ShelvesRepository } from "../repository";
import { buildShelf } from "../testing";

import { PlaceJournalFlow } from "./place-journal.flow";

describe("PlaceJournalFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }) },
        shelves: { Work: buildShelf("Work") },
      },
    });
  });

  it("assigns the journal to the chosen shelf", async () => {
    const promise = harness.resolve(Flows).invoke(PlaceJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen<unknown, string>().submit("Work");
    await promise;

    expect(
      harness
        .resolve(ShelvesRepository)
        .get("Work")
        .getOr(undefined as never)?.journals,
    ).toEqual(["daily"]);
  });

  it("leaves shelf membership unchanged when the modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(PlaceJournalFlow, { journalName: "daily" });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(
      harness
        .resolve(ShelvesRepository)
        .get("Work")
        .getOr(undefined as never)?.journals,
    ).toEqual([]);
  });
});
