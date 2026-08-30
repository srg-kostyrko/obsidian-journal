import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer } from "@/testing";

import { journalsCoreModule } from "../../module";
import { buildNoteletType, fixedJournal } from "../../testing";
import { VaultSubscriptionService } from "../../vault-subscription";

import { CreateNoteletFlow } from "./create-notelet.flow";

import type { TypeId } from "../config";

const ANCHOR = "2026-08-30" as AnchorString;
const TYPE = "nt_7f3a" as TypeId;

const seed = {
  journals: {
    Work: fixedJournal(
      "Work",
      { type: "day" },
      {
        notelets: {
          [TYPE]: buildNoteletType({ id: TYPE, name: "Standup", nameTemplate: "Standup {{notelet_index}}" }),
        },
      },
    ),
  },
};

describe("CreateNoteletFlow", () => {
  it("creates the notelet and opens it", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: seed,
      initialize: [VaultSubscriptionService],
    });

    const result = await harness
      .resolve(Flows)
      .invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR });

    expect(result.isOk() && result.value.path).toBe("Standup 1.md");
    expect(harness.resolve(WorkspaceService).isOpen("Standup 1.md" as VaultPath)).toBe(true);
  });

  it("opens in the requested mode", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: seed,
      initialize: [VaultSubscriptionService],
    });
    const openSpy = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    await harness
      .resolve(Flows)
      .invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR, openMode: "split" });

    expect(openSpy).toHaveBeenCalledWith("Standup 1.md", "split");
  });

  it("opens nothing when creation is refused", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            {
              timeline: { start: "2026-09-01" as AnchorString, end: { kind: "never" } },
              notelets: { [TYPE]: buildNoteletType({ id: TYPE, name: "Standup" }) },
            },
          ),
        },
      },
    });

    const result = await harness
      .resolve(Flows)
      .invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR });

    expect(result.isErr()).toBe(true);
    expect(harness.resolve(WorkspaceService).isOpen("Standup 1.md" as VaultPath)).toBe(false);
  });
});
