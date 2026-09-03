import * as v from "valibot";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { icons } from "@/ui/icons";

import { viewsCoreModule } from "../../module";
import { ViewBlockDefinitionToken } from "../../tokens";

import { noteletsBlock } from "./notelets-block";

describe("noteletsBlock", () => {
  beforeAll(() => initLocale("en"));

  it("is registered with the view block token", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
      data: { journals: {}, shelves: {}, views: {} },
    });
    expect(harness.resolve(ViewBlockDefinitionToken)).toContain(noteletsBlock);
  });

  it("identifies itself", () => {
    expect(noteletsBlock.key).toBe("notelets");
    expect(noteletsBlock.icon).toBe(icons.entity.notelet);
  });

  it("defaults to a day window and no filters", () => {
    expect(noteletsBlock.defaultConfig).toEqual({ window: "day" });
    expect(v.parse(noteletsBlock.schema, {})).toEqual({ window: "day" });
  });

  it("keeps a stored window and filters", () => {
    expect(v.parse(noteletsBlock.schema, { window: "month", journals: ["Daily"], types: ["nt_a"] })).toEqual({
      window: "month",
      journals: ["Daily"],
      types: ["nt_a"],
    });
  });

  it("rejects an unknown window", () => {
    expect(() => v.parse(noteletsBlock.schema, { window: "fortnight" })).toThrow();
  });

  it("summarizes the window alone, then adds each filter's count", () => {
    expect(noteletsBlock.summary?.({ window: "day" })).toBe("Current day");
    expect(noteletsBlock.summary?.({ window: "day", journals: ["a", "b"] })).toContain("2 journals");
    expect(noteletsBlock.summary?.({ window: "day", types: ["a"] })).toContain("1 type");
  });
});
