import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { DashboardBlockToken, SliceDefinitionToken } from "@/settings";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { icons } from "@/ui/icons";

import { viewsCoreModule } from "../../module";
import { ViewBlockDefinitionToken } from "../../tokens";
import { viewsUiModule } from "../../ui-module";

import { dayNotesBlock } from "./day-notes-block";
import { dayNotesSlice } from "./slice";
import DayNotesSettingsBlock from "./ui/DayNotesSettingsBlock.vue";

describe("dayNotesBlock", () => {
  it("defines the agreed key, icon and defaults", () => {
    expect(dayNotesBlock.key).toBe("day-notes");
    expect(dayNotesBlock.icon).toBe(icons.block.dayNotes);
    expect(dayNotesBlock.defaultConfig).toEqual({
      granularity: "day",
      sortField: "modified",
      sortDirection: "desc",
      showHeading: true,
      showNavigation: false,
    });
  });

  it("accepts every period kind and all sort fields", () => {
    for (const granularity of ["day", "week", "month", "quarter", "year", "decade"] as const) {
      for (const sortField of ["name", "modified", "created"] as const) {
        expect(
          v.safeParse(dayNotesBlock.schema, {
            granularity,
            sortField,
            sortDirection: "asc",
            showHeading: false,
            showNavigation: true,
          }).success,
        ).toBe(true);
      }
    }
  });

  it("rejects unsupported period kinds and sort fields", () => {
    expect(v.safeParse(dayNotesBlock.schema, { ...dayNotesBlock.defaultConfig, granularity: "hour" }).success).toBe(
      false,
    );
    expect(v.safeParse(dayNotesBlock.schema, { ...dayNotesBlock.defaultConfig, sortField: "size" }).success).toBe(
      false,
    );
  });

  it("registers the block and its vault-wide slice through viewsCoreModule", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
      data: { journals: {}, shelves: {}, views: {}, dayNotes: {} },
    });

    expect(harness.resolve(ViewBlockDefinitionToken)).toContain(dayNotesBlock);
    expect(harness.resolve(SliceDefinitionToken)).toContain(dayNotesSlice);
  });

  it("registers the creation-date settings beside the Views dashboard", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, viewsUiModule],
      data: { journals: {}, shelves: {}, views: {}, dayNotes: {} },
    });

    expect(harness.resolve(DashboardBlockToken)).toContainEqual({
      key: "day-notes",
      component: DayNotesSettingsBlock,
      order: 8,
    });
  });
});
