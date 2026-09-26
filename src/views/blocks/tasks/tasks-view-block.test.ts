import * as v from "valibot";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { tasksCoreModule } from "@/tasks/module";
import { testContainer } from "@/testing";
import { icons } from "@/ui/icons";

import { viewsCoreModule } from "../../module";
import { ViewBlockDefinitionToken } from "../../tokens";

import { tasksViewBlock } from "./tasks-view-block";

describe("tasksViewBlock", () => {
  beforeAll(() => initLocale("en"));

  it("is registered with the view block token", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, tasksCoreModule, viewsCoreModule],
      data: { journals: {}, shelves: {}, views: {} },
    });
    expect(harness.resolve(ViewBlockDefinitionToken)).toContain(tasksViewBlock);
  });

  it("identifies itself", () => {
    expect(tasksViewBlock.key).toBe("tasks");
    expect(tasksViewBlock.icon).toBe(icons.entity.task);
  });

  it("defaults to the selected day, both sources, open items", () => {
    expect(v.parse(tasksViewBlock.schema, {})).toEqual(tasksViewBlock.defaultConfig);
    expect(tasksViewBlock.defaultConfig.window).toBe("day");
    expect(tasksViewBlock.defaultConfig.scope).toEqual({ provider: [], source: "both", depth: "literal" });
  });

  it("keeps a stored window, journal filter and query", () => {
    const parsed = v.parse(tasksViewBlock.schema, {
      window: "month",
      journals: ["Daily"],
      scope: { provider: [], source: "note", depth: "rollup" },
      sort: "due",
    });
    expect(parsed.window).toBe("month");
    expect(parsed.scope.depth).toBe("rollup");
    expect(parsed.sort).toBe("due");
  });

  it("rejects an unknown window", () => {
    expect(() => v.parse(tasksViewBlock.schema, { window: "fortnight" })).toThrow();
  });

  // depth deliberately has no summary term: a window request always walks every journal already
  // in scope, so there is nothing for "rollup" to describe on this path (see TasksViewBlock.vue).
  it("summarizes the window and each filter's count, without a depth term", () => {
    expect(tasksViewBlock.summary?.({ window: "day" })).toBe("Selected day");
    expect(
      tasksViewBlock.summary?.({ window: "month", scope: { provider: [], source: "both", depth: "rollup" } }),
    ).toBe("Selected month");
    expect(tasksViewBlock.summary?.({ window: "day", journals: ["a", "b"] })).toBe("Selected day · 2 journals");
  });

  it("summarizes a stored config that predates a field rather than rendering a message key", () => {
    expect(tasksViewBlock.summary?.({})).toBe("Selected day");
  });
});
