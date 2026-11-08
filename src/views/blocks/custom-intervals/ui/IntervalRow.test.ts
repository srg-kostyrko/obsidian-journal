import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { provideViewContextStub } from "../../../testing";
import { provideViewContext, type ViewContext } from "../../../view-context";
import { customIntervalsBlock } from "../custom-intervals-block";

import type { BlockInstanceId } from "../../../config";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  viewsCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
  tasksCoreModule,
];

const renderStub = () => h("div");

const RowStub = defineComponent({
  props: { journal: { type: Object, required: true }, segment: { type: Object, required: true } },
  setup: () => renderStub,
});

const JOURNALS: Record<string, JournalConfig> = {
  foo: customJournal("foo", "day", 14, "2026-10-19"),
};

const renderRoot = () =>
  h(customIntervalsBlock.component, { instanceId: "block-1" as BlockInstanceId, config: { window: "quarter" } });

async function mountRows(contextOverride: Partial<ViewContext> = {}) {
  const harness = await testContainer({ modules: MODULES, data: { journals: JOURNALS, views: {} } });
  const context = provideViewContextStub(contextOverride);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  const result = harness.render(Wrapper, { global: { stubs: { NavBlockSegment: RowStub } } });
  return { harness, ...result };
}

const row = (container: Element, anchor: string) =>
  container.querySelector<HTMLElement>(`.journal-view-custom-intervals__entry[data-anchor="${CSS.escape(anchor)}"]`);

function flagged(container: Element, attribute: "today" | "selected"): string[] {
  return [
    ...container.querySelectorAll<HTMLElement>(`.journal-view-custom-intervals__entry[data-${CSS.escape(attribute)}]`),
  ].map((el) => el.dataset.anchor ?? "");
}

describe("IntervalRow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the interval containing today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));
    const { container } = await mountRows({ refDate: ref("2026-12-30" as AnchorString) });

    expect(flagged(container, "today")).toEqual(["2026-11-02"]);
  });

  it("marks the interval containing the view's selected date and follows it", async () => {
    const refDate = ref("2026-11-20" as AnchorString);
    const { container } = await mountRows({ refDate });

    expect(row(container, "2026-11-16")?.dataset.selected).toBe("true");

    refDate.value = "2026-10-20" as AnchorString;
    await nextTick();

    expect(flagged(container, "selected")).toEqual(["2026-10-19"]);
  });

  it("counts a stored extended end date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));
    const { harness, container } = await mountRows({ refDate: ref("2026-12-30" as AnchorString) });

    harness.resolve(JournalsIndex).register({
      journalName: "foo",
      anchor: "2026-10-19" as AnchorString,
      path: "foo/2026-10-19.md" as VaultPath,
      endDate: "2026-11-05" as AnchorString,
    });
    await nextTick();

    expect(flagged(container, "today")).toEqual(["2026-10-19"]);
    expect(row(container, "2026-11-02")).toBeNull();
  });

  it("moves today at midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 10, 15, 23, 59, 0));
    const { container } = await mountRows({ refDate: ref("2026-12-30" as AnchorString) });
    expect(flagged(container, "today")).toEqual(["2026-11-02"]);

    vi.setSystemTime(new Date(2026, 10, 16, 0, 1, 0));
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await nextTick();

    expect(flagged(container, "today")).toEqual(["2026-11-16"]);
  });

  it("paints every fill before every ring and drops only today's fill on the open note", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0));
    const { harness, container } = await mountRows({ refDate: ref("2026-11-03" as AnchorString) });

    const path = "foo/2026-11-02.md" as VaultPath;
    harness.resolve(JournalsIndex).register({ journalName: "foo", anchor: "2026-11-02" as AnchorString, path });
    harness.host.emitFileOpen(harness.host.putFile(path));
    await nextTick();

    const layers = [
      ...(row(container, "2026-11-02")?.querySelectorAll<HTMLElement>(".journal-interval-row__layer") ?? []),
    ];
    expect(layers.map((layer) => layer.dataset.layer)).toEqual([
      "selected-fill",
      "active-fill",
      "today-ring",
      "selected-ring",
      "active-ring",
    ]);
  });
});
