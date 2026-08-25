import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import type { FakeModalService } from "@/infrastructure/host/modals/testing";
import {
  JournalLifecycleFlowError,
  JournalsRepository,
  UnknownJournalError,
  type JournalConfig,
  type NavBlockSegment,
} from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNavSegment, customJournal, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { NavSegmentLifecycleFlowError, UnknownNavSegmentError } from "../errors";
import { navBlockSettingsCoreModule } from "../module";

import { EditNavBlockSegmentFlow } from "./edit-nav-segment.flow";

function journalWithNavLines(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = fixedJournal(name, { type: "day" });
  return { ...base, navBlock: { ...base.navBlock, lines } };
}

function journalWithIntervalLines(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = customJournal(name, "day", 1, "2026-01-01");
  return { ...base, intervalBlock: { ...base.intervalBlock, lines } };
}

async function build(initial: Record<string, JournalConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, navBlockSettingsCoreModule],
    ...(Object.keys(initial).length > 0 && { data: { journals: initial } }),
  });
  return { repo: harness.resolve(JournalsRepository), modals: harness.modals, flows: harness.resolve(Flows) };
}

const segA = buildNavSegment({ template: "A" });
const segB = buildNavSegment({ template: "B" });
const submittedSegment = buildNavSegment({ template: "SUBMITTED" });

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
    const { flows } = await build();
    const result = await flows.invoke(EditNavBlockSegmentFlow, { journalName: "missing" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalLifecycleFlowError);
    expect(result.kind === "err" && (result.error as JournalLifecycleFlowError).cause).toBeInstanceOf(
      UnknownJournalError,
    );
  });

  it("errors for a line index out of range", async () => {
    const { flows } = await build({ daily: journalWithNavLines("daily", [[segA]]) });
    const result = await flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily", lineIndex: 5 });
    expect(result.kind === "err" && result.error).toBeInstanceOf(NavSegmentLifecycleFlowError);
    const cause = result.kind === "err" && (result.error as NavSegmentLifecycleFlowError).cause;
    expect(cause).toBeInstanceOf(UnknownNavSegmentError);
    expect((cause as UnknownNavSegmentError).target).toBe("line");
  });

  it("errors for a segment index out of range", async () => {
    const { flows } = await build({ daily: journalWithNavLines("daily", [[segA]]) });
    const result = await flows.invoke(EditNavBlockSegmentFlow, {
      journalName: "daily",
      lineIndex: 0,
      segmentIndex: 4,
    });
    expect(result.kind === "err" && result.error).toBeInstanceOf(NavSegmentLifecycleFlowError);
    const cause = result.kind === "err" && (result.error as NavSegmentLifecycleFlowError).cause;
    expect(cause).toBeInstanceOf(UnknownNavSegmentError);
    expect((cause as UnknownNavSegmentError).target).toBe("segment");
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build({ daily: journalWithNavLines("daily", []) });
    const promise = flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("appends a new line when no indices are given", async () => {
    const { flows, modals, repo } = await build({ daily: journalWithNavLines("daily", [[segA], [segB]]) });
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
    const { flows, modals, repo } = await build({ daily: journalWithNavLines("daily", [[segA], [segB]]) });
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
    const { flows, modals, repo } = await build({ daily: journalWithNavLines("daily", [[segA, segB]]) });
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
    const { flows, modals, repo } = await build({ custom: journalWithIntervalLines("custom", [[segA]]) });
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
    const { flows, modals } = await build({ daily: journalWithNavLines("daily", [[segA, segB]]) });
    void flows.invoke(EditNavBlockSegmentFlow, { journalName: "daily", lineIndex: 0, segmentIndex: 1 });
    expect(modals.lastOpen<{ segment?: NavBlockSegment }, unknown>().props.segment).toEqual(segB);
    modals.lastOpen().cancel();
  });
});
