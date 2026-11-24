import { assert, describe, expect, it, vi } from "vitest";

import { userDateFormat } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { withoutEras } from "@/calendar/testing";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer } from "@/testing";

import { journalsCoreModule } from "../../module";
import { JournalDateFormatError } from "../../notes/errors";
import { buildNoteletType, fixedJournal } from "../../testing";
import { VaultSubscriptionService } from "../../vault-subscription";

import { CreateNoteletFlow } from "./create-notelet.flow";

import type { Prompt } from "../../prompts/config";
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

  it("creates without opening when openMode is null", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: seed,
      initialize: [VaultSubscriptionService],
    });
    const open = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    const result = await harness
      .resolve(Flows)
      .invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR, openMode: null });

    expect(result.isOk()).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(harness.templater.cursorJumps).toEqual([]);
  });

  it("opens in the active pane when openMode is omitted", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: seed,
      initialize: [VaultSubscriptionService],
    });
    const open = vi.spyOn(harness.resolve(WorkspaceService), "openNote");

    await harness.resolve(Flows).invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR });

    expect(open).toHaveBeenCalledWith(expect.any(String), "active");
  });

  it("passes the assigned counter back to its caller", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: seed,
      initialize: [VaultSubscriptionService],
    });

    const result = await harness
      .resolve(Flows)
      .invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR, openMode: null });

    expect(result.isOk() && result.value).toMatchObject({ counter: 1 });
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

describe("CreateNoteletFlow — a journal whose date format cannot render", () => {
  it("shows the format notice, not a missing journal, when the type asks questions first", async () => {
    const attendee: Prompt = {
      variable: "attendee",
      question: "Who?",
      type: "text",
      frontmatterKey: "attendee",
      required: false,
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "week" },
            {
              dateFormat: userDateFormat("YYYYy-[W]w"),
              notelets: {
                [TYPE]: buildNoteletType({
                  id: TYPE,
                  name: "Standup",
                  nameTemplate: "Standup {{notelet_index}}",
                  prompts: [attendee],
                }),
              },
            },
          ),
        },
      },
      initialize: [VaultSubscriptionService],
    });

    const result = await withoutEras(() =>
      harness.resolve(Flows).invoke(CreateNoteletFlow, { journalName: "Work", typeId: TYPE, anchor: ANCHOR }),
    );

    assert(result.isErr() && result.error instanceof JournalDateFormatError, "expected JournalDateFormatError");
    expect(harness.notices.messages).toEqual([result.error.userNotice]);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
