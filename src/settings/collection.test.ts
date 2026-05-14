import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { ReactiveCollection } from "./collection";
import { defineCollection } from "./schema";

import type { SettingsNotice } from "./notices";

const journalSchema = v.object({
  name: v.string(),
  enabled: v.boolean(),
});

const journalCollection = defineCollection("journals", journalSchema, (id) => ({
  name: id,
  enabled: true,
}));

function setup(raw: unknown) {
  const notices: SettingsNotice[] = [];
  const collection = new ReactiveCollection(journalCollection, raw, (n) => notices.push(n));
  return { collection, notices };
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

    it("emits a slice-reset notice when an entry is invalid", () => {
      const { notices } = setup({ broken: { name: 42 } });
      expect(notices).toHaveLength(1);
      expect(notices[0].kind).toBe("slice-reset");
      expect(notices[0].sliceKey).toBe("journals/broken");
    });

    it("starts empty when raw is undefined", () => {
      const { collection } = setup(undefined);
      expect(collection.entries.size).toBe(0);
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
      expect(collection.entries.size).toBe(0);
    });
  });

  describe("serialize", () => {
    it("returns a plain object mirroring entries", () => {
      const { collection } = setup({ daily: { name: "Daily", enabled: true } });
      collection.add("weekly");
      expect(collection.serialize()).toEqual({
        daily: { name: "Daily", enabled: true },
        weekly: { name: "weekly", enabled: true },
      });
    });
  });
});
