import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import type { AnchorString } from "@/calendar";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import {
  JournalLifecycleFlowError,
  JournalsRepository,
  UnknownJournalError,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockSegment,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { NavSegmentLifecycleFlowError, UnknownNavSegmentError } from "../errors";

import { EditNavBlockSegmentFlow } from "./edit-nav-segment.flow";

function buildJournal(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, navBlock: { ...base.navBlock, lines } };
}

function buildCustomJournal(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return { ...base, intervalBlock: { ...base.intervalBlock, lines } };
}

function build(initial: Record<string, JournalConfig> = {}) {
  const { container } = createSettingsService({ collections: [] });
  const storage = reactive<Record<string, JournalConfig>>({ ...initial });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalsRepository).useValue(repo);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(EditNavBlockSegmentFlow).useClass(EditNavBlockSegmentFlow);
  return { repo, modals, flows: container.resolve(Flows) };
}

const segA: NavBlockSegment = {
  template: "A",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  linkDate: "",
  addDecorations: false,
};

const segB: NavBlockSegment = { ...segA, template: "B" };
const submittedSegment: NavBlockSegment = { ...segA, template: "SUBMITTED" };

function linesOf(repo: JournalsRepository): NavBlockSegment[][] {
  return repo.get("daily").getOrUndefined()?.navBlock.lines ?? [];
}

function submit(modals: FakeModalService, segment: NavBlockSegment): void {
  modals.lastOpen<{ journalName: string; segment?: NavBlockSegment }, { segment: NavBlockSegment }>().submit({
    segment,
  });
}

describe("EditNavBlockSegmentFlow", () => {
  it("returns UnknownJournalError when the journal does not exist", async () => {
    const { flows } = build();
    const result = await flows.invoke(EditNavBlockSegmentFlow, { journalName: "missing" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("errors for a line index out of range", async () => {
    const { flows } = build({ daily: buildJournal("daily", [[segA]]) });
    const result = await flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily", lineIndex: 5 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(NavSegmentLifecycleFlowError);
    expect(result.kind === "err" && (result.error as NavSegmentLifecycleFlowError).cause).toBeInstanceOf(
      UnknownNavSegmentError,
    );
  });

  it("errors for a segment index out of range", async () => {
    const { flows } = build({ daily: buildJournal("daily", [[segA]]) });
    const result = await flows.invoke(EditNavBlockSegmentFlow, {
      journalName: "daily",
      lineIndex: 0,
      segmentIndex: 4,
    });
    expect(result.kind === "err" && result.error).toBeInstanceOf(NavSegmentLifecycleFlowError);
    expect(result.kind === "err" && (result.error as NavSegmentLifecycleFlowError).cause).toBeInstanceOf(
      UnknownNavSegmentError,
    );
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = build({ daily: buildJournal("daily", []) });
    const promise = flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends a new line when no indices are given", async () => {
    const { flows, modals, repo } = build({ daily: buildJournal("daily", [[segA], [segB]]) });
    const promise = flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily" });
    submit(modals, submittedSegment);
    const result = await promise;
    expect(linesOf(repo)).toHaveLength(3);
    expect(linesOf(repo).at(2)).toEqual([submittedSegment]);
    expect(result.kind === "ok" && result.value).toEqual({
      segment: submittedSegment,
      lineIndex: 2,
      segmentIndex: 0,
    });
  });

  it("appends a segment to an existing line when only lineIndex is given", async () => {
    const { flows, modals, repo } = build({ daily: buildJournal("daily", [[segA], [segB]]) });
    const promise = flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily", lineIndex: 1 });
    submit(modals, submittedSegment);
    const result = await promise;
    expect(linesOf(repo)).toHaveLength(2);
    expect(linesOf(repo).at(1)).toEqual([segB, submittedSegment]);
    expect(result.kind === "ok" && result.value).toEqual({
      segment: submittedSegment,
      lineIndex: 1,
      segmentIndex: 1,
    });
  });

  it("replaces a segment in place when both indices are given", async () => {
    const { flows, modals, repo } = build({ daily: buildJournal("daily", [[segA, segB]]) });
    const promise = flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily", lineIndex: 0, segmentIndex: 1 });
    submit(modals, submittedSegment);
    const result = await promise;
    expect(linesOf(repo).at(0)).toEqual([segA, submittedSegment]);
    expect(result.kind === "ok" && result.value).toEqual({
      segment: submittedSegment,
      lineIndex: 0,
      segmentIndex: 1,
    });
  });

  it("appends to intervalBlock lines when the field is intervalBlock", async () => {
    const { flows, modals, repo } = build({ custom: buildCustomJournal("custom", [[segA]]) });
    const promise = flows.invoke(EditNavBlockSegmentFlow, { journalName: "custom", field: "intervalBlock" });
    submit(modals, submittedSegment);
    const result = await promise;
    expect(repo.get("custom").getOrUndefined()?.intervalBlock.lines).toHaveLength(2);
    expect(result.kind === "ok" && result.value).toEqual({
      segment: submittedSegment,
      lineIndex: 1,
      segmentIndex: 0,
    });
  });

  it("passes the existing segment to the modal when editing in place", async () => {
    const { flows, modals } = build({ daily: buildJournal("daily", [[segA, segB]]) });
    void flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily", lineIndex: 0, segmentIndex: 1 });
    expect(modals.lastOpen<{ segment?: NavBlockSegment }, unknown>().props.segment).toEqual(segB);
    modals.lastOpen().cancel();
  });
});
