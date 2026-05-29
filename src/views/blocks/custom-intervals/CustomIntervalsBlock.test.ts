import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { JournalsIndex, JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals";

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
    setup: (p) => () => h("div", { "data-testid": "row-stub", "data-row": (p.row as { template: string }).template }),
  }),
}));

const SCOPE: { custom: readonly string[] } = { custom: [] };

interface FakeRange {
  readonly journalName: string;
  readonly anchors: readonly AnchorString[];
}
const RANGES: FakeRange[] = [];

class FakeJournalsIndex {
  getRange(name: string, _start: AnchorString, _end: AnchorString): ReadonlyMap<AnchorString, VaultPath> {
    const range = RANGES.find((r) => r.journalName === name);
    if (!range) return new Map();
    return new Map(range.anchors.map((a) => [a, ("/" + name + "/" + a + ".md") as VaultPath]));
  }
}

const JOURNALS: Record<string, JournalConfig> = {};

class FakeJournalsRepository {
  get(name: string): Option<JournalConfig> {
    return Option.fromNullable(JOURNALS[name] ?? null);
  }
}

function makeJournal(name: string, rows: { template: string }[]): JournalConfig {
  return {
    name,
    write: { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "date",
      startDateField: "start",
      endDateField: "end",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2026-01-01" as AnchorString, allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    decorations: [],
    navBlock: { type: "create", rows: [], decorateWholeBlock: false },
    intervalBlock: {
      type: "create",
      rows: rows.map((r) => ({
        template: r.template,
        fontSize: 1,
        bold: false,
        italic: false,
        link: "none",
        journal: "",
        color: { type: "theme", name: "text-normal" },
        background: { type: "transparent" },
        addDecorations: false,
      })),
      decorateWholeBlock: false,
    },
  };
}

function mountBlock(config: CustomIntervalsConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.register(JournalsIndex).useValue(new FakeJournalsIndex() as unknown as JournalsIndex);
  container.register(JournalsRepository).useValue(new FakeJournalsRepository() as unknown as JournalsRepository);
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
  RANGES.length = 0;
  for (const k of Object.keys(JOURNALS)) delete JOURNALS[k];
});

describe("CustomIntervalsBlock", () => {
  it("renders one section per custom journal in the active shelf when journals is omitted", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = makeJournal("foo", [{ template: "{{date}}" }]);
    JOURNALS.bar = makeJournal("bar", [{ template: "{{date}}" }]);
    RANGES.push(
      { journalName: "foo", anchors: ["2026-05-10" as AnchorString] },
      { journalName: "bar", anchors: ["2026-05-12" as AnchorString] },
    );
    const { container } = mountBlock(
      { window: "current-month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-journal]").length).toBe(2);
  });

  it("filters to the configured journals list when provided", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = makeJournal("foo", [{ template: "{{date}}" }]);
    JOURNALS.bar = makeJournal("bar", [{ template: "{{date}}" }]);
    RANGES.push(
      { journalName: "foo", anchors: ["2026-05-10" as AnchorString] },
      { journalName: "bar", anchors: ["2026-05-12" as AnchorString] },
    );
    const { container } = mountBlock(
      { journals: ["foo"], window: "current-month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    const sections = container.querySelectorAll("[data-journal]");
    expect(sections.length).toBe(1);
    expect((sections[0] as HTMLElement).dataset.journal).toBe("foo");
  });

  it("hides a journal section with no entries when hideEmpty is true", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = makeJournal("foo", [{ template: "{{date}}" }]);
    JOURNALS.bar = makeJournal("bar", [{ template: "{{date}}" }]);
    RANGES.push({ journalName: "foo", anchors: ["2026-05-10" as AnchorString] });
    // bar has no entries
    const { container } = mountBlock(
      { window: "current-month", hideEmpty: true },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-journal]").length).toBe(1);
  });

  it("shows a journal section with no entries when hideEmpty is false", () => {
    SCOPE.custom = ["foo", "bar"];
    JOURNALS.foo = makeJournal("foo", [{ template: "{{date}}" }]);
    JOURNALS.bar = makeJournal("bar", [{ template: "{{date}}" }]);
    RANGES.push({ journalName: "foo", anchors: ["2026-05-10" as AnchorString] });
    const { container } = mountBlock(
      { window: "current-month", hideEmpty: false },
      { refDate: ref("2026-05-15" as AnchorString) },
    );
    expect(container.querySelectorAll("[data-journal]").length).toBe(2);
  });

  it("uses the configured window relative to refDate to fetch entries", () => {
    SCOPE.custom = ["foo"];
    JOURNALS.foo = makeJournal("foo", [{ template: "{{date}}" }]);
    const spy = vi.spyOn(FakeJournalsIndex.prototype, "getRange");
    RANGES.push({ journalName: "foo", anchors: ["2026-05-10" as AnchorString] });
    mountBlock({ window: "current-month", hideEmpty: false }, { refDate: ref("2026-05-15" as AnchorString) });
    expect(spy).toHaveBeenCalledWith("foo", "2026-05-01", "2026-05-31");
    spy.mockRestore();
  });
});
