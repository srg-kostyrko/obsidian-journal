import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { CycleService, JournalsIndex, JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { periodBoundsOf } from "@/journals/notelets/listing";
import { periodLabelOf } from "@/journals/notelets/ui/period-label";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { ActiveEntryViewModel } from "@/notes-calendar";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "../../module";
import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";
import { resolveWindow } from "../custom-intervals/window-resolution";

import { noteletsBlock, type NoteletsBlockConfig } from "./notelets-block";
import NoteletsBlock from "./ui/NoteletsBlock.vue";

import type { BlockInstanceId } from "../../config";

const BLOCK_ID = "44444444-4444-4444-8444-444444444444" as BlockInstanceId;
const DAY = "2026-08-12" as AnchorString;
const WEEK = "2026-08-10" as AnchorString;

const daily = fixedJournal(
  "Daily",
  { type: "day" },
  {
    notelets: { nt_meeting: buildNoteletType({ id: "nt_meeting" as never, name: "Meeting" }) },
  },
);
const weekly = fixedJournal(
  "Weekly",
  { type: "week" },
  {
    notelets: { nt_review: buildNoteletType({ id: "nt_review" as never, name: "Review" }) },
  },
);

async function mountBlock(
  options: {
    config?: Partial<NoteletsBlockConfig>;
    context?: Partial<ViewContext>;
    journals?: Record<string, ReturnType<typeof fixedJournal>>;
    shelves?: Record<string, ReturnType<typeof buildShelf>>;
  } = {},
): Promise<{ harness: TestHarness }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, notesCalendarModule],
    data: {
      journals: options.journals ?? { Daily: daily, Weekly: weekly },
      shelves: options.shelves ?? {},
      views: {},
    },
  });
  const context = provideViewContextStub({ refDate: ref(DAY), ...options.context });
  const config = { ...noteletsBlock.defaultConfig, ...options.config };
  const renderBlock = () => h(NoteletsBlock, { instanceId: BLOCK_ID, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderBlock;
    },
  });
  harness.render(Wrapper, { props: {} });
  return { harness };
}

function listingDependenciesOf(harness: TestHarness) {
  return {
    journals: harness.resolve(JournalsRepository),
    index: harness.resolve(JournalsIndex),
    cycle: harness.resolve(CycleService),
  };
}

function registerNotelet(
  harness: TestHarness,
  seed: { journalName: string; anchor: AnchorString; path: string; typeName: string; typeId?: string | null },
): void {
  harness.resolve(JournalsIndex).register({
    kind: "notelet",
    journalName: seed.journalName,
    anchor: seed.anchor,
    path: seed.path as VaultPath,
    typeName: seed.typeName,
    typeId: (seed.typeId ?? "nt_meeting") as never,
  });
}

describe("NoteletsBlock", () => {
  beforeAll(async () => {
    const { initLocale } = await import("@/i18n");
    initLocale("en");
  });

  it("shows the empty message with no notelets in the window", async () => {
    await mountBlock();
    expect(screen.getByText(m.journal_notelet_list_empty())).toBeTruthy();
  });

  it("labels the header with the resolved window's period in window mode", async () => {
    await mountBlock();
    const resolved = resolveWindow("day", DAY);
    const expected = periodLabelOf({ start: resolved.start, end: resolved.end, kind: "day" });
    expect(screen.getByRole("heading", { level: 3, name: expected })).toBeTruthy();
  });

  it("labels the header with the resolved window's period for a wider window kind", async () => {
    await mountBlock({ config: { window: "month" } });
    const resolved = resolveWindow("month", DAY);
    const expected = periodLabelOf({ start: resolved.start, end: resolved.end, kind: "month" });
    expect(screen.getByRole("heading", { level: 3, name: expected })).toBeTruthy();
  });

  it("lists a day window's notelets across the shelf, including a week that only overlaps", async () => {
    const { harness } = await mountBlock();
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    registerNotelet(harness, {
      journalName: "Weekly",
      anchor: WEEK,
      path: "W/Retro.md",
      typeName: "Review",
      typeId: "nt_review",
    });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.getByText("Retro")).toBeTruthy();
  });

  it("recomputes when a notelet is registered after mount", async () => {
    const { harness } = await mountBlock();
    expect(screen.queryByText("Standup")).toBeNull();
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("follows the active note's period, ignoring the configured window", async () => {
    const { harness } = await mountBlock({ config: { window: "year" } });
    harness.resolve(ActiveEntryViewModel).active.value = { journalName: "Weekly", anchor: WEEK };
    registerNotelet(harness, {
      journalName: "Weekly",
      anchor: WEEK,
      path: "W/Retro.md",
      typeName: "Review",
      typeId: "nt_review",
    });
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Retro")).toBeTruthy();
    expect(screen.queryByText("Standup")).toBeNull();

    const bounds = periodBoundsOf(listingDependenciesOf(harness), "Weekly", WEEK);
    if (bounds === undefined) throw new Error("expected Weekly to resolve period bounds at WEEK");
    expect(screen.getByRole("heading", { level: 3, name: periodLabelOf(bounds) })).toBeTruthy();
  });

  it("follows a day note that is already the active entry, even though the origin is navigate", async () => {
    const { harness } = await mountBlock({ config: { window: "year" } });
    harness.resolve(ActiveEntryViewModel).active.value = { journalName: "Daily", anchor: DAY };
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    registerNotelet(harness, {
      journalName: "Weekly",
      anchor: WEEK,
      path: "W/Retro.md",
      typeName: "Review",
      typeId: "nt_review",
    });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.queryByText("Retro")).toBeNull();

    const bounds = periodBoundsOf(listingDependenciesOf(harness), "Daily", DAY);
    if (bounds === undefined) throw new Error("expected Daily to resolve period bounds at DAY");
    expect(screen.getByRole("heading", { level: 3, name: periodLabelOf(bounds) })).toBeTruthy();
  });

  it("does not follow when the view's follow-active-date setting is off", async () => {
    const { harness } = await mountBlock({
      config: { window: "year" },
      context: { followActiveDate: ref(false) },
    });
    harness.resolve(ActiveEntryViewModel).active.value = { journalName: "Daily", anchor: DAY };
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    registerNotelet(harness, {
      journalName: "Weekly",
      anchor: WEEK,
      path: "W/Retro.md",
      typeName: "Review",
      typeId: "nt_review",
    });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.getByText("Retro")).toBeTruthy();

    const resolved = resolveWindow("year", DAY);
    const expected = periodLabelOf({ start: resolved.start, end: resolved.end, kind: "year" });
    expect(screen.getByRole("heading", { level: 3, name: expected })).toBeTruthy();
  });

  it("falls back to the window once refDate moves outside the active entry's period", async () => {
    const FAR = "2026-12-25" as AnchorString;
    const { harness } = await mountBlock({
      config: { window: "month" },
      context: { refDate: ref(FAR) },
    });
    harness.resolve(ActiveEntryViewModel).active.value = { journalName: "Weekly", anchor: WEEK };
    registerNotelet(harness, {
      journalName: "Weekly",
      anchor: WEEK,
      path: "W/Retro.md",
      typeName: "Review",
      typeId: "nt_review",
    });
    registerNotelet(harness, { journalName: "Daily", anchor: FAR, path: "D/Summary.md", typeName: "Meeting" });
    await nextTick();
    // A wrongly-engaged follow mode would show only Weekly's own period (Retro, no Summary);
    // a correct fallback to the month window around FAR shows the reverse.
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.queryByText("Retro")).toBeNull();

    const resolved = resolveWindow("month", FAR);
    const expected = periodLabelOf({ start: resolved.start, end: resolved.end, kind: "month" });
    expect(screen.getByRole("heading", { level: 3, name: expected })).toBeTruthy();
  });

  it("falls back to the window when the followed journal is filtered out", async () => {
    const { harness } = await mountBlock({ config: { journals: ["Daily"] } });
    harness.resolve(ActiveEntryViewModel).active.value = { journalName: "Weekly", anchor: WEEK };
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("falls back to the window when no journal note is open", async () => {
    const { harness } = await mountBlock();
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("scopes to the view's shelf", async () => {
    const { harness } = await mountBlock({
      shelves: { Work: buildShelf("Work", { journals: ["Daily"] }) },
      context: { shelf: ref("Work") },
    });
    registerNotelet(harness, {
      journalName: "Weekly",
      anchor: WEEK,
      path: "W/Retro.md",
      typeName: "Review",
      typeId: "nt_review",
    });
    await nextTick();
    expect(screen.queryByText("Retro")).toBeNull();
    expect(screen.getByText(m.journal_notelet_list_empty())).toBeTruthy();
  });

  it("offers creation from the header", async () => {
    await mountBlock();
    expect(screen.getByLabelText(m.journal_notelet_list_create())).toBeTruthy();
  });

  it("offers no creation when no journal in scope defines a type", async () => {
    await mountBlock({ journals: { Plain: fixedJournal("Plain", { type: "day" }) } });
    expect(screen.queryByLabelText(m.journal_notelet_list_create())).toBeNull();
    expect(screen.getByText(m.journal_notelet_list_empty())).toBeTruthy();
  });

  it("lists a notelet whose period is outside the journal's timeline, but offers no creation there", async () => {
    const bounded = fixedJournal(
      "Daily",
      { type: "day" },
      {
        notelets: { nt_meeting: buildNoteletType({ id: "nt_meeting" as never, name: "Meeting" }) },
        timeline: { start: "2020-01-01" as AnchorString, end: { kind: "date", date: "2020-12-31" as AnchorString } },
      },
    );
    const { harness } = await mountBlock({ journals: { Daily: bounded } });
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.queryByLabelText(m.journal_notelet_list_create())).toBeNull();
  });

  it("treats an empty journals filter as no filter", async () => {
    const { harness } = await mountBlock({ config: { journals: [] } });
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });
});
