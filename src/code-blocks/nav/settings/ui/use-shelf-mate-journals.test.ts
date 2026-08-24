import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { journalsCoreModule } from "@/journals/module";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { useShelfMateJournals } from "./use-shelf-mate-journals";

async function mount(journalName: string, shelves?: Record<string, ShelfConfig>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    ...(shelves && { data: { shelves } }),
  });

  let result: readonly string[] = [];
  const Probe = defineComponent({
    setup() {
      const list = useShelfMateJournals(journalName);
      return () => {
        result = list.value;
        return h("div");
      };
    },
  });

  harness.render(Probe);
  return () => result;
}

describe("useShelfMateJournals", () => {
  it("returns shelf-mates excluding the current journal", async () => {
    const get = await mount("daily", { home: buildShelf("home", { journals: ["daily", "weekly"] }) });
    expect(get()).toEqual(["weekly"]);
  });

  it("returns empty when the journal is not in any shelf", async () => {
    const get = await mount("daily", { home: buildShelf("home", { journals: ["weekly"] }) });
    expect(get()).toEqual([]);
  });

  it("returns empty when no shelves exist", async () => {
    const get = await mount("daily");
    expect(get()).toEqual([]);
  });
});
