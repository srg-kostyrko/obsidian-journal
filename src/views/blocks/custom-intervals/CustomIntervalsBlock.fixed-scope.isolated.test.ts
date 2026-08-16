import { cleanup, render } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h, inject as vueInject, ref } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import type { AnchorString } from "@/calendar/types";
import { navSegmentFixedScope, navSegmentIntervalScope } from "@/code-blocks/nav/decoration-scopes";
import { decorationsSlice, DecorationEngine, DecorationsStore, type CellStyleRef } from "@/decorations";
import { cellKey } from "@/decorations/engine";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { NoteMetadataService, NotesService, PluginData, type NotesEvents } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakePluginData } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { CycleService, JournalsIndex, JournalsRepository, journalDefaultsFor, TimelineService } from "@/journals";
import type { JournalConfig, NavBlockSegment } from "@/journals";
import { customJournal, fakeRepo } from "@/journals/testing";
import { ActiveEntryViewModel, type ActiveEntryRef } from "@/notes-calendar";
import { SettingsEventsToken, SettingsService, SliceDefinitionToken, type SettingsEvents } from "@/settings";
import { SnapshotService } from "@/settings/snapshots/snapshot-service";
import { ShelvesRepository } from "@/shelves";
import { fakeShelvesRepo } from "@/shelves/testing";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { customIntervalsBlock, type CustomIntervalsConfig } from "./custom-intervals-block";

import type { BlockInstanceId } from "../../config";

vi.mock("@/notes-calendar/use-shelf-scope", () => ({
  useShelfScope: () => ({
    all: computed(() => SCOPE.custom),
    fixed: computed<readonly string[]>(() => []),
    day: computed<readonly string[]>(() => []),
    week: computed<readonly string[]>(() => []),
    month: computed<readonly string[]>(() => []),
    quarter: computed<readonly string[]>(() => []),
    year: computed<readonly string[]>(() => []),
    custom: computed(() => SCOPE.custom),
  }),
}));

// A dumb stub, like the sibling isolated suite's — except this one also injects both
// per-segment scopes and exposes them, so a test can assert directly on what
// CustomIntervalsBlock registered into each map without needing NavBlockSegment's own
// (already-covered-elsewhere) link resolution and rendering.
const CAPTURED: {
  fixed: ReadonlyMap<string, CellStyleRef> | null;
  interval: ReadonlyMap<string, CellStyleRef> | null;
} = { fixed: null, interval: null };

vi.mock("@/code-blocks/nav/ui/NavBlockSegment.vue", () => ({
  default: defineComponent({
    props: { journal: { type: Object, required: true }, segment: { type: Object, required: true } },
    setup: (p) => {
      CAPTURED.fixed = vueInject(navSegmentFixedScope.map, null);
      CAPTURED.interval = vueInject(navSegmentIntervalScope.map, null);
      return () => h("div", { "data-testid": "row-stub", "data-row-journal": (p.journal as { name: string }).name });
    },
  }),
}));

const SCOPE: { custom: readonly string[] } = { custom: [] };
const JOURNALS: Record<string, JournalConfig> = {};
const ACTIVE = ref<ActiveEntryRef | null>(null);

function segment(overrides: Partial<NavBlockSegment>): NavBlockSegment {
  return {
    template: "",
    fontSize: 1,
    bold: false,
    italic: false,
    link: "none",
    journal: "",
    linkDate: "",
    color: { type: "theme", name: "text-normal" },
    background: { type: "transparent" },
    addDecorations: false,
    ...overrides,
  };
}

function mountBlock(config: CustomIntervalsConfig, contextOverride: Partial<ViewContext> = {}) {
  const container = new Container();
  container.addModule(createLoggerTestingModule().module);
  container.register(JournalsRepository).useValue(fakeRepo(JOURNALS));
  container.register(ShelvesRepository).useValue(fakeShelvesRepo());
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(ActiveEntryViewModel).useValue({ active: ACTIVE } as unknown as ActiveEntryViewModel);
  container.register(DecorationEngine).useClass(DecorationEngine);
  const metadata = new FakeNoteMetadataService();
  container.register(NoteMetadataService).useValue(metadata as unknown as NoteMetadataService);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  container.register(SnapshotService).useClass(SnapshotService);
  container.register(SliceDefinitionToken).useValue(decorationsSlice);
  container.register(SettingsEventsToken).useValue(createNanoEvents<SettingsEvents>());
  container.register(SettingsService).useClass(SettingsService);
  container.resolve(SettingsService).getSlice(decorationsSlice).state = { decorations: [] };
  container.register(DecorationsStore).useClass(DecorationsStore);
  const context = provideViewContextStub(contextOverride);
  const renderRoot = () => h(customIntervalsBlock.component, { instanceId: "block-1" as BlockInstanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  return render(Wrapper, { global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] } });
}

beforeAll(() => {
  installTestCalendar();
});

afterEach(() => {
  cleanup();
  SCOPE.custom = [];
  ACTIVE.value = null;
  CAPTURED.fixed = null;
  CAPTURED.interval = null;
  for (const k of Object.keys(JOURNALS)) delete JOURNALS[k];
});

describe("CustomIntervalsBlock fixed-scope decoration", () => {
  it("registers a fixed-period target for a linked interval segment, into the fixed scope", () => {
    SCOPE.custom = ["sprint"];
    JOURNALS.sprint = customJournal("sprint", "week", 1, "2026-01-05", {
      intervalBlock: {
        type: "create",
        decorateWholeBlock: false,
        lines: [[segment({ template: "{{date:YYYY}}", link: "year", addDecorations: true })]],
      },
    });
    JOURNALS.yearly = {
      ...journalDefaultsFor({ type: "year" }, "yearly"),
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
    };

    mountBlock({ window: "month" }, { refDate: ref("2026-05-15" as AnchorString) });

    const cells = CAPTURED.fixed;
    expect(cells).not.toBeNull();
    const key = cellKey("year", "2026-01-01" as AnchorString);
    expect(cells?.get(key)?.value.some((style) => style.type === "corner")).toBe(true);
  });

  it("registers another custom journal's own interval anchor for a journal-linked interval segment, not only the raw section periods", () => {
    SCOPE.custom = ["sprint"];
    JOURNALS.sprint = customJournal("sprint", "week", 1, "2026-01-05", {
      intervalBlock: {
        type: "create",
        decorateWholeBlock: false,
        lines: [[segment({ template: "{{date:YYYY}}", link: "journal", journal: "sprint2", addDecorations: true })]],
      },
    });
    // A different weekly schedule so its resolved anchor never coincides with one of sprint's
    // own raw section anchors — proving the cell comes from the segment's target resolution,
    // not the section periods sprint itself already registers.
    JOURNALS.sprint2 = customJournal("sprint2", "week", 1, "2026-01-01", {
      decorations: [
        buildDecoration({
          conditions: [buildCondition("date")],
          styles: [buildStyle("corner", { placement: "top-left" })],
        }),
      ],
    });

    mountBlock({ window: "month" }, { refDate: ref("2026-05-15" as AnchorString) });

    const cells = CAPTURED.interval;
    expect(cells).not.toBeNull();
    expect([...(cells?.values() ?? [])].some((ref) => ref.value.some((style) => style.type === "corner"))).toBe(true);
  });
});
