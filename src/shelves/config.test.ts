import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { shelvesCollection } from "./config";

describe("shelvesCollection", () => {
  it("loads a shelf saved before decorations existed with an empty decoration list", () => {
    const parsed = v.parse(shelvesCollection.itemSchema, { name: "work", journals: [] });
    expect(parsed.decorations).toEqual([]);
  });

  it("keeps a shelf's journals when its decorations fail to parse", () => {
    const parsed = v.parse(shelvesCollection.itemSchema, {
      name: "work",
      journals: ["daily"],
      decorations: [{ type: "not-a-decoration" }],
    });
    expect(parsed.journals).toEqual(["daily"]);
    expect(parsed.decorations).toEqual([]);
  });
});
