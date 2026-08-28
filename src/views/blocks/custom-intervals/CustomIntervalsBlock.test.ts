import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { customIntervalsBlock, type CustomIntervalsConfig } from "./custom-intervals-block";

import type { BlockInstanceId } from "../../config";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  viewsCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
];

const RowStub = defineComponent({
  props: { journal: { type: Object, required: true }, segment: { type: Object, required: true } },
  setup: (p) => () => h("div", { "data-testid": "row-stub", "data-row-journal": (p.journal as { name: string }).name }),
});

const cornerHasNote = (): JournalConfig["decorations"][number] =>
  buildDecoration({ mode: "or", conditions: [buildCondition("has-note")], styles: [buildStyle("corner")] });

async function mountBlock(
  journals: Record<string, JournalConfig>,
  config: CustomIntervalsConfig,
  contextOverride: Partial<ViewContext> = {},
) {
  const harness = await testContainer({ modules: MODULES, data: { journals, views: {} } });
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(customIntervalsBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  const result = harness.render(Wrapper, { global: { stubs: { NavBlockSegment: RowStub } } });
  return { harness, ...result };
}

function markActive(harness: Awaited<ReturnType<typeof mountBlock>>["harness"], journalName: string, anchor: string) {
  const path = `${journalName}/${anchor}.md` as VaultPath;
  harness.resolve(JournalsIndex).register({ journalName, anchor: anchor as AnchorString, path });
  harness.host.emitFileOpen(harness.host.putFile(path));
}

describe("CustomIntervalsBlock", () => {
  it("renders one section per custom journal in the active shelf when journals is omitted", async () => {
    const journals = {
      foo: customJournal("foo", "day", 1, "2026-01-01"),
      bar: customJournal("bar", "day", 1, "2026-01-01"),
    };
    const { container } = await mountBlock(
      journals,
      { window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-journal]").length).toBe(2);
  });

  it("filters to the configured journals list when provided", async () => {
    const journals = {
      foo: customJournal("foo", "day", 1, "2026-01-01"),
      bar: customJournal("bar", "day", 1, "2026-01-01"),
    };
    const { container } = await mountBlock(
      journals,
      { journals: ["foo"], window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const sections = container.querySelectorAll("[data-journal]");
    expect(sections.length).toBe(1);
    expect((sections[0] as HTMLElement).dataset.journal).toBe("foo");
  });

  it("lists every scheduled interval in the window even when no notes exist", async () => {
    const journals = { foo: customJournal("foo", "day", 1, "2026-01-01") };
    const { container } = await mountBlock(
      journals,
      { window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-anchor]").length).toBe(31);
  });

  it("clips projected intervals to the journal timeline end", async () => {
    const journals = {
      foo: customJournal("foo", "day", 1, "2026-01-01", {
        timeline: { start: "2026-01-01" as AnchorString, end: { kind: "date", date: "2026-05-10" as AnchorString } },
      }),
    };
    const { container } = await mountBlock(
      journals,
      { window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const anchors = [...container.querySelectorAll<HTMLElement>("[data-anchor]")].map((el) => el.dataset.anchor);
    expect(anchors).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ]);
  });

  it("shifts the rendered window when the reference date changes", async () => {
    const journals = { foo: customJournal("foo", "day", 1, "2026-01-01") };
    const refDate = ref("2026-05-15" as AnchorString);
    const { container } = await mountBlock(journals, { window: "month" }, { refDate });

    refDate.value = "2026-07-10" as AnchorString;
    await nextTick();

    const anchors = [...container.querySelectorAll<HTMLElement>("[data-anchor]")].map((el) => el.dataset.anchor ?? "");
    expect(anchors.every((anchor) => anchor.startsWith("2026-07"))).toBe(true);
  });

  it("hides a journal with no in-window intervals", async () => {
    const journals = {
      foo: customJournal("foo", "day", 1, "2026-01-01"),
      bar: customJournal("bar", "day", 1, "2026-01-01", {
        timeline: { start: "2020-01-01" as AnchorString, end: { kind: "date", date: "2020-01-01" as AnchorString } },
      }),
    };
    const { container } = await mountBlock(
      journals,
      { window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const sections = container.querySelectorAll("[data-journal]");
    expect(sections.length).toBe(1);
    expect((sections[0] as HTMLElement).dataset.journal).toBe("foo");
  });

  it("marks the entry matching the active note as active", async () => {
    const journals = { foo: customJournal("foo", "day", 1, "2026-01-01") };
    const { harness, container } = await mountBlock(
      journals,
      { window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    markActive(harness, "foo", "2026-05-12");
    await nextTick();

    const active = container.querySelectorAll<HTMLElement>(".journal-view-custom-intervals__entry[data-active]");
    expect(active.length).toBe(1);
    expect(active[0]?.dataset.anchor).toBe("2026-05-12");
  });

  it("marks no entry active when the active note belongs to another journal", async () => {
    const journals = { foo: customJournal("foo", "day", 1, "2026-01-01") };
    const { harness, container } = await mountBlock(
      journals,
      { window: "month" },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    markActive(harness, "bar", "2026-05-12");
    await nextTick();

    expect(container.querySelectorAll(".journal-view-custom-intervals__entry[data-active]").length).toBe(0);
  });

  describe("decorations", () => {
    it("decorates the interval entry whose note matches the journal decoration", async () => {
      const journals = { foo: customJournal("foo", "day", 1, "2026-01-01", { decorations: [cornerHasNote()] }) };
      const { harness, container } = await mountBlock(
        journals,
        { window: "month" },
        { refDate: ref("2026-05-15" as AnchorString) },
      );

      const path = "foo/2026-05-12.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "foo", anchor: "2026-05-12" as AnchorString, path });
      harness.host.putFile(path);
      await nextTick();

      const entry = container.querySelector('.journal-view-custom-intervals__entry[data-anchor="2026-05-12"]');
      expect(entry?.querySelector(".decoration-corner")).not.toBeNull();
    });

    it("does not paint an offset decoration on interval rows", async () => {
      // Offset decorations mark single days inside an interval; they render on the day
      // calendar grid, never on the whole-interval row.
      const journals = {
        foo: customJournal("foo", "day", 10, "2026-05-01", {
          decorations: [
            buildDecoration({
              mode: "or",
              conditions: [buildCondition("offset", { offset: 1 })],
              styles: [buildStyle("corner")],
            }),
          ],
        }),
      };
      const { container } = await mountBlock(
        journals,
        { window: "month" },
        { refDate: ref("2026-05-15" as AnchorString) },
      );
      await nextTick();

      const entry = container.querySelector('.journal-view-custom-intervals__entry[data-anchor="2026-05-11"]');
      expect(entry).not.toBeNull();
      expect(entry?.querySelector(".decoration-corner")).toBeNull();
    });

    it("keeps one custom journal's decoration off a co-anchored interval of another", async () => {
      const journals = {
        foo: customJournal("foo", "week", 1, "2026-01-05", { decorations: [cornerHasNote()] }),
        bar: customJournal("bar", "week", 1, "2026-01-05"),
      };
      const { harness, container } = await mountBlock(
        journals,
        { window: "month" },
        { refDate: ref("2026-05-15" as AnchorString) },
      );

      const path = "foo/2026-05-11.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "foo", anchor: "2026-05-11" as AnchorString, path });
      harness.host.putFile(path);
      await nextTick();

      const decorated = '[data-journal="foo"] .journal-view-custom-intervals__entry[data-anchor="2026-05-11"]';
      const bare = '[data-journal="bar"] .journal-view-custom-intervals__entry[data-anchor="2026-05-11"]';
      expect(container.querySelector(decorated)?.querySelector(".decoration-corner")).not.toBeNull();
      expect(container.querySelector(bare)?.querySelector(".decoration-corner")).toBeNull();
    });

    it("leaves an interval entry without a note undecorated", async () => {
      const journals = { foo: customJournal("foo", "day", 1, "2026-01-01", { decorations: [cornerHasNote()] }) };
      const { harness, container } = await mountBlock(
        journals,
        { window: "month" },
        { refDate: ref("2026-05-15" as AnchorString) },
      );

      const path = "foo/2026-05-12.md" as VaultPath;
      harness.resolve(JournalsIndex).register({ journalName: "foo", anchor: "2026-05-12" as AnchorString, path });
      harness.host.putFile(path);
      await nextTick();

      const bare = container.querySelector('.journal-view-custom-intervals__entry[data-anchor="2026-05-13"]');
      expect(bare?.querySelector(".decoration-corner")).toBeNull();
    });
  });
});
