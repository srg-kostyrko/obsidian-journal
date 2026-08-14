import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { navBlockSchema } from "./nav-config";

describe("navBlockSchema", () => {
  it("parses an empty object to an empty config", () => {
    expect(v.parse(navBlockSchema, {})).toEqual({});
  });

  it("degrades a non-mapping fence body to an empty config instead of failing", () => {
    // The nav fence carries no options, so a scalar or sequence body must not blank the block
    // into an error panel — mirrors the home/timeline tolerance for the same malformed input.
    expect(v.parse(navBlockSchema, "journal-nav")).toEqual({});
    expect(v.parse(navBlockSchema, ["a", "b"])).toEqual({});
  });
});
