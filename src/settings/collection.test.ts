import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Logger } from "@/infrastructure/logger";
import { MemorySink } from "@/infrastructure/logger/testing";

import { ReactiveCollection } from "./collection";
import { defineCollection } from "./schema";

import type { InferOutput } from "valibot";

const journalSchema = v.object({
  name: v.string(),
  enabled: v.boolean(),
});

const journalCollection = defineCollection("journals", journalSchema, (id) => ({
  name: id,
  enabled: true,
}));

function setup(raw: unknown) {
  const entries = reactive<Record<string, InferOutput<typeof journalSchema>>>({});
  const logger = new Logger("settings", [new MemorySink()]);
  const collection = new ReactiveCollection(journalCollection, entries, raw, logger);
  return { collection };
}

describe("ReactiveCollection", () => {
  describe("hydration", () => {
    it("seeds entries from a raw object", () => {
      const { collection } = setup({ daily: { name: "Daily", enabled: true } });
      expect(collection.get("daily")).toEqual({ name: "Daily", enabled: true });
    });

    it("falls back to defaultItem for an invalid entry", () => {
      const { collection } = setup({ broken: { name: 42 } });
      expect(collection.get("broken")).toEqual({ name: "broken", enabled: true });
    });

    it("starts empty when raw is undefined", () => {
      const { collection } = setup(undefined);
      expect(Object.keys(collection.entries)).toHaveLength(0);
    });
  });

  describe("mutation", () => {
    it("add inserts a new item using the default factory", () => {
      const { collection } = setup(undefined);
      const item = collection.add("weekly");
      expect(item).toEqual({ name: "weekly", enabled: true });
      expect(collection.get("weekly")).toBe(item);
    });

    it("add merges init over the default", () => {
      const { collection } = setup(undefined);
      const item = collection.add("weekly", { enabled: false });
      expect(item.enabled).toBe(false);
      expect(item.name).toBe("weekly");
    });

    it("remove drops the entry", () => {
      const { collection } = setup({ daily: { name: "Daily", enabled: true } });
      collection.remove("daily");
      expect(collection.get("daily")).toBeUndefined();
      expect(Object.keys(collection.entries)).toHaveLength(0);
    });
  });
});
