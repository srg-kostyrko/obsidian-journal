import { beforeEach, describe, expect, it, vi } from "vitest";

import { Flows } from "@/infrastructure/flows";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../../module";
import { fixedJournal } from "../../../testing";
import { defaultBulkAddParameters } from "../config";

import { BulkAddFlow } from "./bulk-add.flow";

import type { BulkPlan } from "../bulk-add-service";
import type { BulkAddParameters } from "../config";

describe("BulkAddFlow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("plans with the configured parameters then opens the process modal", async () => {
    harness.host.putFolder("src");
    const promise = harness.resolve(Flows).invoke(BulkAddFlow, { journalName: "daily" });

    harness.modals.lastOpen().submit({ ...defaultBulkAddParameters(), folder: "src" });
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(2));

    const opened = harness.modals.lastOpen<{ journalName: string; plan: BulkPlan; parameters: BulkAddParameters }>();
    expect(opened.props.plan).toEqual({ notes: [] });
    expect(opened.props.parameters).toEqual(expect.objectContaining({ folder: "src" }));

    harness.modals.lastOpen<unknown, void>().submit(undefined);
    await promise;
  });

  it("aborts cleanly when the configure modal is cancelled", async () => {
    const promise = harness.resolve(Flows).invoke(BulkAddFlow, { journalName: "daily" });

    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.kind).toBe("err");
    expect(harness.modals.opens).toHaveLength(1);
  });
});
