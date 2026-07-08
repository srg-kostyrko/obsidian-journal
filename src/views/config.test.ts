import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { viewSchema, viewsCollection } from "./config";

describe("viewsCollection", () => {
  describe("default", () => {
    it("uses the supplied id as the view id", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.id).toBe("abc");
    });

    it("uses the supplied id as the initial name", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.name).toBe("abc");
    });

    it("seeds an empty blocks list", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.blocks).toEqual([]);
    });

    it("seeds defaultShelf as null", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.defaultShelf).toBeNull();
    });

    it("seeds showInRibbon as false", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.showInRibbon).toBe(false);
    });

    it("defaults a new view's leaf placement to right", () => {
      const created = viewsCollection.defaultItem("11111111-1111-4111-8111-111111111111");
      expect(created.leaf).toBe("right");
    });

    it("seeds icon as calendar-days", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.icon).toBe("calendar-days");
    });

    it("seeds openOnStartup as false", () => {
      const seed = viewsCollection.defaultItem("abc");
      expect(seed.openOnStartup).toBe(false);
    });
  });

  describe("viewSchema validation", () => {
    it("rejects a view with an empty name", () => {
      const result = v.safeParse(viewSchema, {
        ...viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"),
        name: "",
      });
      expect(result.success).toBe(false);
    });

    it("accepts a view with an empty icon so clearing it never wipes the stored view on reload", () => {
      const result = v.safeParse(viewSchema, {
        ...viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"),
        icon: "",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a block instance with an empty key", () => {
      const result = v.safeParse(viewSchema, {
        ...viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"),
        blocks: [{ id: "5f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b", key: "", config: {} }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts a default-seeded view", () => {
      const result = v.safeParse(viewSchema, viewsCollection.defaultItem("3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b"));
      expect(result.success).toBe(true);
    });
  });

  describe("openOnStartup back-compat", () => {
    it("defaults openOnStartup to false when the stored field is absent", () => {
      const { openOnStartup: _omit, ...withoutField } = viewsCollection.defaultItem(
        "3f8c8b7e-1c1a-4d5e-9b9b-1c1a4d5e9b9b",
      );
      const result = v.safeParse(viewSchema, withoutField);
      expect(result.success && result.output.openOnStartup).toBe(false);
    });
  });
});
