import { beforeEach, describe, expect, it, vi } from "vitest";

import { Flows } from "@/infrastructure/flows";
import type { TypeId } from "@/journals/notelets/config";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../../module";
import { buildNoteletType, fixedJournal } from "../../../testing";
import { BulkAddService } from "../bulk-add-service";
import { defaultBulkAddParameters } from "../config";

import { BulkAddNoteletsFlow } from "./bulk-add-notelets.flow";

import type { BulkPlan } from "../bulk-add-service";
import type { BulkAddParameters } from "../config";

describe("BulkAddNoteletsFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
  });

  it("plans against the type and opens the process modal", async () => {
    harness.host.putFolder("src");
    const promise = harness.resolve(Flows).invoke(BulkAddNoteletsFlow, { journalName: "daily", typeId: "nt_1" });

    harness.modals.lastOpen().submit({ ...defaultBulkAddParameters(), folder: "src", noteletTypeId: "nt_1" });
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(2));

    const opened = harness.modals.lastOpen<{ journalName: string; plan: BulkPlan; parameters: BulkAddParameters }>();
    expect(opened.props.parameters).toEqual(expect.objectContaining({ noteletTypeId: "nt_1" }));

    harness.modals.lastOpen<unknown, void>().submit(undefined);
    await promise;
  });

  it("aborts cleanly when the configure modal is cancelled", async () => {
    const plan = vi.spyOn(harness.resolve(BulkAddService), "plan");
    const promise = harness.resolve(Flows).invoke(BulkAddNoteletsFlow, { journalName: "daily", typeId: "nt_1" });

    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind).toBe("err");
    expect(plan).not.toHaveBeenCalled();
  });
});
