import { beforeAll, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { buildCondition, buildDecoration, buildStyle } from "@/decorations/testing";
import { initLocale } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import TimelineQuarter from "./TimelineQuarter.vue";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
];

beforeAll(() => initLocale("en"));

describe("TimelineQuarter", () => {
  it("sizes its columns around the padding the journals in scope reserve", async () => {
    // Three months share one row, so the row has to know how wide a decorated month gets
    // before it decides how many of them fit.
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("shape", { placement_x: "right", placement_y: "middle", size: 0.5 })],
    });
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) } },
    });

    const { container } = harness.render(TimelineQuarter, { props: { refDate: anchor("2026-08-15"), shelf: null } });

    const grid = container.querySelector<HTMLElement>(".timeline-quarter");
    expect(grid?.style.getPropertyValue("--journal-cell-padding-inline")).toBe("max(0.6em, 2px)");
  });
});
