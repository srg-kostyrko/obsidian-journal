import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig } from "@/journals";
import { customJournal, fakeRepo } from "@/journals/testing";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { customIntervalsBlock, type CustomIntervalsConfig } from "./custom-intervals-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed(() => SCOPE.custom),
    day: computed<readonly string[]>(() => []),
    week: computed<readonly string[]>(() => []),
    month: computed<readonly string[]>(() => []),
    quarter: computed<readonly string[]>(() => []),
    year: computed<readonly string[]>(() => []),
    custom: computed(() => SCOPE.custom),
  }),
}));

vi.mock("@/code-blocks/nav/ui/NavBlockRow.vue", () => ({
  default: defineComponent({
    props: { journal: { type: Object, required: true }, row: { type: Object, required: true } },
    setup: (p) => () =>
      h("div", { "data-testid": "row-stub", "data-row-journal": (p.journal as { name: string }).name }),
  }),
}));

const SCOPE: { custom: readonly string[] } = { custom: [] };

const JOURNALS: Record<string, JournalConfig> = {};

const ACTIVE = ref<ActiveEntryRef | null>(null);

function mountBlock(config: CustomIntervalsConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.register(JournalsRepository).useValue(fakeRepo(JOURNALS));
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(ActiveEntryViewModel).useValue({ active: ACTIVE } as unknown as ActiveEntryViewModel);
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(customIntervalsBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  SCOPE.custom = [];
  ACTIVE.value = null;
  for (const k of Object.keys(JOURNALS)) delete JOURNALS[k];
});

describe("CustomIntervalsBlock", () => {
  it("renders one section per custom journal in the active shelf when journals is omitted", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    JOURNALS.bar = customJournal("bar", "day", 1, "2026-01-01");
    const { container } = mountBlock(
      { window: "month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-journal]").length).toBe(2);
  });

  it("filters to the configured journals list when provided", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    JOURNALS.bar = customJournal("bar", "day", 1, "2026-01-01");
    const { container } = mountBlock(
      { journals: ["foo"], window: "month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const sections = container.querySelectorAll("[data-journal]");
    expect(sections.length).toBe(1);
    expect((sections[0] as HTMLElement).dataset.journal).toBe("foo");
  });

  it("lists every scheduled interval in the window even when no notes exist", () => {
    SCOPE.custom = ["foo"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    const { container } = mountBlock(
      { window: "month", hideEmpty: true },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-anchor]").length).toBe(31);
  });

  it("clips projected intervals to the journal timeline end", () => {
    SCOPE.custom = ["foo"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01", {
      timeline: { start: "2026-01-01" as AnchorString, end: { kind: "date", date: "2026-05-10" as AnchorString } },
    });
    const { container } = mountBlock(
      { window: "month", hideEmpty: true },
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

  it("hides a journal with no in-window intervals when hideEmpty is true", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    JOURNALS.bar = customJournal("bar", "day", 1, "2026-01-01", {
      timeline: { start: "2020-01-01" as AnchorString, end: { kind: "date", date: "2020-01-01" as AnchorString } },
    });
    const { container } = mountBlock(
      { window: "month", hideEmpty: true },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const sections = container.querySelectorAll("[data-journal]");
    expect(sections.length).toBe(1);
    expect((sections[0] as HTMLElement).dataset.journal).toBe("foo");
  });

  it("shows an empty journal section when hideEmpty is false", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    JOURNALS.bar = customJournal("bar", "day", 1, "2026-01-01", {
      timeline: { start: "2020-01-01" as AnchorString, end: { kind: "date", date: "2020-01-01" as AnchorString } },
    });
    const { container } = mountBlock(
      { window: "month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-journal]").length).toBe(2);
  });

  it("marks the entry matching the active note as active", () => {
    SCOPE.custom = ["foo"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    ACTIVE.value = { journalName: "foo", anchor: "2026-05-12" as AnchorString };
    const { container } = mountBlock(
      { window: "month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const active = container.querySelectorAll<HTMLElement>(".journal-view-custom-intervals__entry[data-active]");
    expect(active.length).toBe(1);
    expect(active[0]?.dataset.anchor).toBe("2026-05-12");
  });

  it("marks no entry active when the active note belongs to another journal", () => {
    SCOPE.custom = ["foo"];
    JOURNALS.foo = customJournal("foo", "day", 1, "2026-01-01");
    ACTIVE.value = { journalName: "bar", anchor: "2026-05-12" as AnchorString };
    const { container } = mountBlock(
      { window: "month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll(".journal-view-custom-intervals__entry[data-active]").length).toBe(0);
  });
});
