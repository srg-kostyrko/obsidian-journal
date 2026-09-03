import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { ActiveEntryViewModel } from "@/notes-calendar";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "../../module";
import { provideViewContextStub } from "../../testing";
import { provideViewContext, type RefDateOrigin, type ViewContext } from "../../view-context";

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
    const { harness } = await mountBlock({
      config: { window: "year" },
      context: { refDateOrigin: ref<RefDateOrigin>("follow") },
    });
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
  });

  it("falls back to the window when the followed journal is filtered out", async () => {
    const { harness } = await mountBlock({
      config: { journals: ["Daily"] },
      context: { refDateOrigin: ref<RefDateOrigin>("follow") },
    });
    harness.resolve(ActiveEntryViewModel).active.value = { journalName: "Weekly", anchor: WEEK };
    registerNotelet(harness, { journalName: "Daily", anchor: DAY, path: "D/Standup.md", typeName: "Meeting" });
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("falls back to the window when no journal note is open", async () => {
    const { harness } = await mountBlock({ context: { refDateOrigin: ref<RefDateOrigin>("follow") } });
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
});
