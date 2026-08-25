import { describe, expect, it } from "vitest";
import { defineComponent, h, inject as vueInject, ref } from "vue";

import type { AnchorString } from "@/calendar/types";
import { navSegmentFixedScope, navSegmentIntervalScope } from "@/code-blocks/nav/decoration-scopes";
import type { CellStyleRef } from "@/decorations";
import { cellKey } from "@/decorations/engine";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { journalDefaultsFor, type JournalConfig, type NavBlockSegment } from "@/journals";
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

// A dumb stub, like the sibling suite's — except this one also injects both per-segment scopes
// and exposes them, so a test can assert directly on what CustomIntervalsBlock registered into
// each map without needing NavBlockSegment's own (already-covered-elsewhere) link resolution and
// rendering.
const CAPTURED: {
  fixed: ReadonlyMap<string, CellStyleRef> | null;
  interval: ReadonlyMap<string, CellStyleRef> | null;
} = { fixed: null, interval: null };

const RowStub = defineComponent({
  props: { journal: { type: Object, required: true }, segment: { type: Object, required: true } },
  setup: (p) => {
    CAPTURED.fixed = vueInject(navSegmentFixedScope.map, null);
    CAPTURED.interval = vueInject(navSegmentIntervalScope.map, null);
    return () => h("div", { "data-testid": "row-stub", "data-row-journal": (p.journal as { name: string }).name });
  },
});

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

describe("CustomIntervalsBlock fixed-scope decoration", () => {
  it("registers a fixed-period target for a linked interval segment, into the fixed scope", async () => {
    const journals: Record<string, JournalConfig> = {
      sprint: customJournal("sprint", "week", 1, "2026-01-05", {
        intervalBlock: {
          type: "create",
          decorateWholeBlock: false,
          lines: [[segment({ template: "{{date:YYYY}}", link: "year", addDecorations: true })]],
        },
      }),
      yearly: {
        ...journalDefaultsFor({ type: "year" }, "yearly"),
        decorations: [
          buildDecoration({
            conditions: [buildCondition("date")],
            styles: [buildStyle("corner", { placement: "top-left" })],
          }),
        ],
      },
    };

    await mountBlock(journals, { window: "month" }, { refDate: ref("2026-05-15" as AnchorString) });

    const cells = CAPTURED.fixed;
    expect(cells).not.toBeNull();
    const key = cellKey("year", "2026-01-01" as AnchorString);
    expect(cells?.get(key)?.value.some((style) => style.type === "corner")).toBe(true);
  });

  it("registers another custom journal's own interval anchor for a journal-linked interval segment, not only the raw section periods", async () => {
    const journals: Record<string, JournalConfig> = {
      sprint: customJournal("sprint", "week", 1, "2026-01-05", {
        intervalBlock: {
          type: "create",
          decorateWholeBlock: false,
          lines: [[segment({ template: "{{date:YYYY}}", link: "journal", journal: "sprint2", addDecorations: true })]],
        },
      }),
      // A different weekly schedule so its resolved anchor never coincides with one of sprint's
      // own raw section anchors — proving the cell comes from the segment's target resolution,
      // not the section periods sprint itself already registers.
      sprint2: customJournal("sprint2", "week", 1, "2026-01-01", {
        decorations: [
          buildDecoration({
            conditions: [buildCondition("date")],
            styles: [buildStyle("corner", { placement: "top-left" })],
          }),
        ],
      }),
    };

    await mountBlock(journals, { window: "month" }, { refDate: ref("2026-05-15" as AnchorString) });

    const cells = CAPTURED.interval;
    expect(cells).not.toBeNull();
    expect([...(cells?.values() ?? [])].some((ref) => ref.value.some((style) => style.type === "corner"))).toBe(true);
  });
});
