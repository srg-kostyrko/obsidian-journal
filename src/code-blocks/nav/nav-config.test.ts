import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { navBlockKeys, navBlockSchema } from "./nav-config";

describe("navBlockSchema", () => {
  it("leaves adjacent unset on an empty fence body so the journal's setting applies", () => {
    expect(v.parse(navBlockSchema, {})).toEqual({ adjacent: undefined });
  });

  it("degrades a non-mapping fence body to an empty config instead of failing", () => {
    // The nav fence's only option is optional, so a scalar or sequence body must not blank the
    // block into an error panel — mirrors the home/timeline tolerance for the same malformed input.
    expect(v.parse(navBlockSchema, "journal-nav")).toEqual({ adjacent: undefined });
    expect(v.parse(navBlockSchema, ["a", "b"])).toEqual({ adjacent: undefined });
  });

  it("reads a boolean adjacent as the override of the journal's setting", () => {
    expect(v.parse(navBlockSchema, { adjacent: false })).toEqual({ adjacent: false });
    expect(v.parse(navBlockSchema, { adjacent: true })).toEqual({ adjacent: true });
  });

  it("degrades a non-boolean adjacent to unset rather than an error panel", () => {
    // js-yaml 4 reads only true/false as booleans, so an on/off word arrives as a string.
    expect(v.parse(navBlockSchema, { adjacent: "no" })).toEqual({ adjacent: undefined });
    expect(v.parse(navBlockSchema, { adjacent: 0 })).toEqual({ adjacent: undefined });
    expect(v.parse(navBlockSchema, { adjacent: null })).toEqual({ adjacent: undefined });
  });

  it("reports its own option as the only recognized key", () => {
    expect(navBlockKeys).toEqual(["adjacent"]);
  });
});
