import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { navBlockSchema } from "./nav-config";

describe("navBlockSchema", () => {
  it("parses an empty object to an empty config", () => {
    expect(v.parse(navBlockSchema, {})).toEqual({});
  });

  it("degrades a non-mapping fence body to an empty config instead of failing", () => {
    // v2 never read the nav fence body, so a scalar or sequence must not blank the block
    // into an error panel — mirror the home/timeline tolerance.
    expect(v.parse(navBlockSchema, "journal-nav")).toEqual({});
    expect(v.parse(navBlockSchema, ["a", "b"])).toEqual({});
  });
});
