import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { testContainer, type TestHarness } from "@/testing";

import { OpenDateFlow } from "../flows/open-date.flow";
import { journalsCoreModule } from "../module";
import { CreateNoteletFlow } from "../notelets/flows/create-notelet.flow";
import { buildNoteletType, fixedJournal } from "../testing";
import { VaultSubscriptionService } from "../vault-subscription";

import { JournalUriHandler } from "./journal-uri-handler";

import type { JournalConfig } from "../config";
import type { NoteletType, TypeId } from "../notelets/config";
import type { Prompt } from "../prompts/config";

const DAILY = fixedJournal("daily", { type: "day" });
const WORK = fixedJournal("work", { type: "day" });
const FUTURE_DAILY = fixedJournal(
  "daily",
  { type: "day" },
  { timeline: { start: anchor("2027-01-01"), end: { kind: "never" } } },
);

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function trigger(harness: TestHarness, parameters: Record<string, string>): void {
  harness.host.emitProtocol("journals", { action: "journals", ...parameters });
}

describe("JournalUriHandler dispatch", () => {
  describe("one daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: DAILY } },
        initialize: [JournalUriHandler],
      });
    });

    it("invokes OpenDateFlow for a named journal and ISO date", async () => {
      trigger(harness, { journal: "daily", date: "2026-06-04", mode: "tab" });
      await flush();

      expect(harness.host.workspace.openCalls).toEqual([{ path: "2026-06-04.md", mode: "tab" }]);
    });

    it("defaults to today when no date is given", async () => {
      trigger(harness, { journal: "daily" });
      await flush();

      expect(harness.host.workspace.openCalls).toEqual([
        { path: `${CalendarDate.today().toAnchor()}.md`, mode: false },
      ]);
    });
  });

  it("passes every journal of a write type as candidates", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: DAILY, work: WORK } },
      initialize: [JournalUriHandler],
    });

    trigger(harness, { type: "day", date: "2026-06-04" });
    await flush();

    expect(harness.suggests.lastOpen<readonly string[], string>().input).toEqual(["daily", "work"]);
  });
});

describe("JournalUriHandler errors", () => {
  // Both tests below keep the dispatch spy: their refusals happen before any note is touched, so
  // the vault cannot tell a flow that was not dispatched at all from one dispatched and refused.
  describe("no journals configured", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: {} },
        initialize: [JournalUriHandler],
      });
    });

    it("notifies and opens nothing for an unknown journal name", async () => {
      const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

      trigger(harness, { journal: "missing" });
      await flush();

      expect(invokeSpy).not.toHaveBeenCalled();
      expect(harness.notices.messages).toHaveLength(1);
    });

    it("notifies when no journal of the requested type exists", async () => {
      const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

      trigger(harness, { type: "week" });
      await flush();

      expect(invokeSpy).not.toHaveBeenCalled();
      expect(harness.notices.messages).toHaveLength(1);
      expect(harness.notices.messages[0]).toContain("week");
    });
  });

  it("notifies and opens nothing for a date that cannot be parsed", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: DAILY } },
      initialize: [JournalUriHandler],
    });

    trigger(harness, { journal: "daily", date: "not-a-date" });
    await flush();

    expect(harness.host.workspace.openCalls).toEqual([]);
    expect(harness.notices.messages).toHaveLength(1);
  });

  it("notifies when the flow reports no applicable journals", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: FUTURE_DAILY } },
      initialize: [JournalUriHandler],
    });

    // anchorOf answers for a journal outside its own timeline, so the handler dispatches and the
    // flow is the one that finds nothing applicable — the seam this test is about.
    trigger(harness, { journal: "daily", date: "2026-06-04" });
    await flush();

    expect(harness.notices.messages).toHaveLength(1);
  });

  it("stays silent when the journal picker is dismissed", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: DAILY, work: WORK } },
      initialize: [JournalUriHandler],
    });

    trigger(harness, { type: "day", date: "2026-06-04" });
    await flush();
    harness.suggests.lastOpen().cancel();
    await flush();

    expect(harness.notices.messages).toHaveLength(0);
  });
});

const MEETING = "nt_a" as TypeId;

const ATTENDEE: Prompt = {
  type: "text",
  variable: "attendee",
  question: "Who with?",
  frontmatterKey: "meeting-with",
  required: false,
};

// `overrides` must never carry `notelets`: it would replace the Meeting type outright and turn
// every case below into the unknown-type branch. The stored `id` disagrees with the record key on
// purpose — where they agree, a resolver reading `type.id` passes every test here.
function withMeetingType(
  overrides: Partial<JournalConfig> = {},
  typeOverrides: Partial<NoteletType> = {},
): JournalConfig {
  return fixedJournal(
    "Work",
    { type: "day" },
    {
      notelets: {
        [MEETING]: buildNoteletType({
          id: "nt_stale" as TypeId,
          name: "Meeting",
          nameTemplate: "Meeting {{notelet_index}}",
          ...typeOverrides,
        }),
      },
      ...overrides,
    },
  );
}

async function noteletHarness(journal: JournalConfig): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule],
    data: { journals: { Work: journal } },
    initialize: [VaultSubscriptionService, JournalUriHandler],
  });
}

describe("JournalUriHandler notelet creation", () => {
  it("creates a notelet of the named type at the resolved anchor", async () => {
    const harness = await noteletHarness(withMeetingType());
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Work", notelet: "Meeting", date: "2026-09-02" });
    await flush();

    expect(invokeSpy).toHaveBeenCalledWith(
      CreateNoteletFlow,
      { journalName: "Work", typeId: MEETING, anchor: "2026-09-02", openMode: "active" },
      { notify: false },
    );
    expect(harness.host.files.has("Meeting 1.md")).toBe(true);
  });

  it("does not open the period note", async () => {
    const harness = await noteletHarness(withMeetingType());
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Work", notelet: "Meeting", date: "2026-09-02" });
    await flush();

    expect(invokeSpy).not.toHaveBeenCalledWith(OpenDateFlow, expect.anything(), expect.anything());
    expect(harness.host.files.has("2026-09-02.md")).toBe(false);
  });

  it("passes the open mode through", async () => {
    const harness = await noteletHarness(withMeetingType());
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Work", notelet: "Meeting", date: "2026-09-02", mode: "split" });
    await flush();

    expect(invokeSpy).toHaveBeenCalledWith(
      CreateNoteletFlow,
      expect.objectContaining({ openMode: "split" }),
      expect.anything(),
    );
  });

  it("never asks unattended", async () => {
    const harness = await noteletHarness(withMeetingType());
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Work", notelet: "Meeting", date: "2026-09-02" });
    await flush();

    const call = invokeSpy.mock.calls.find(([flow]) => flow === CreateNoteletFlow);
    expect(call).toBeDefined();
    expect(call?.[1]).not.toHaveProperty("unattended");
  });

  it("reports a type name the journal does not define", async () => {
    const harness = await noteletHarness(withMeetingType());
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Work", notelet: "Nope", date: "2026-09-02" });
    await flush();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(harness.notices.messages).toEqual([m.uri_unknown_notelet_type({ journal: "Work", type: "Nope" })]);
  });

  it("reports an unknown journal before looking at the type", async () => {
    const harness = await noteletHarness(withMeetingType());
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Nope", notelet: "Meeting", date: "2026-09-02" });
    await flush();

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(harness.notices.messages).toEqual([m.uri_unknown_journal({ journal: "Nope" })]);
  });

  it("stays silent when the type's questions are dismissed", async () => {
    const harness = await noteletHarness(withMeetingType({}, { prompts: [ATTENDEE] }));

    trigger(harness, { journal: "Work", notelet: "Meeting", date: "2026-09-02" });
    await vi.waitFor(() => {
      expect(harness.modals.opens).toHaveLength(1);
    });
    harness.modals.lastOpen().cancel();
    await flush();

    expect(harness.notices.messages).toEqual([]);
    expect(harness.host.files.has("Meeting 1.md")).toBe(false);
  });

  it("reports a date outside the journal's timeline", async () => {
    const harness = await noteletHarness(
      withMeetingType({ timeline: { start: anchor("2027-01-01"), end: { kind: "never" } } }),
    );
    const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

    trigger(harness, { journal: "Work", notelet: "Meeting", date: "2026-09-02" });
    await flush();

    // anchorOf answers for a journal outside its own timeline, so the refusal has to come back
    // from the creation flow rather than from the anchor guard above it.
    expect(invokeSpy).toHaveBeenCalledWith(CreateNoteletFlow, expect.anything(), expect.anything());
    expect(harness.notices.messages).toEqual([m.uri_no_journal()]);
    expect(harness.host.files.has("Meeting 1.md")).toBe(false);
  });
});
