import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { noteletsCodeBlock } from "./notelets-block";
import { noteletsBlockKeys, noteletsBlockSchema } from "./notelets-config";

describe("noteletsBlockSchema", () => {
  it("defaults to no type filter", () => {
    expect(v.parse(noteletsBlockSchema, {})).toEqual({ types: [] });
  });

  it("keeps a list of type names", () => {
    expect(v.parse(noteletsBlockSchema, { types: ["Meeting", "Gym"] })).toEqual({ types: ["Meeting", "Gym"] });
  });

  it("lifts a single scalar into a one-item list", () => {
    expect(v.parse(noteletsBlockSchema, { types: "Meeting" })).toEqual({ types: ["Meeting"] });
  });

  it("coerces a YAML-typed scalar to its string form", () => {
    expect(v.parse(noteletsBlockSchema, { types: [2024, true] })).toEqual({ types: ["2024", "true"] });
  });

  it("degrades a mapping to no filter", () => {
    expect(v.parse(noteletsBlockSchema, { types: { a: 1 } })).toEqual({ types: [] });
  });

  it("degrades a non-mapping body to defaults", () => {
    expect(v.parse(noteletsBlockSchema, "types:Meeting")).toEqual({ types: [] });
  });

  it("reports its own keys", () => {
    expect(noteletsBlockKeys).toEqual(["types"]);
  });

  it("registers the journal-notelets key", () => {
    expect(noteletsCodeBlock.keys).toEqual(["journal-notelets"]);
    expect(noteletsCodeBlock.cssClass).toEqual(["journal-notelets-code-block"]);
  });
});
