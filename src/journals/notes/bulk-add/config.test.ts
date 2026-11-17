import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { bulkAddParametersSchema, defaultBulkAddParameters } from "./config";

describe("bulkAddParametersSchema", () => {
  it("keeps no notelet scope on a saved tag or property filter", () => {
    const parsed = v.parse(bulkAddParametersSchema, {
      ...defaultBulkAddParameters(),
      filters: [
        { type: "tag", condition: "contains", value: "x", source: "notelets", quantifier: "all", typeIds: ["nt_a"] },
        { type: "property", name: "p", valueType: "text", condition: "exists", value: "", source: "both" },
      ],
    });

    for (const filter of parsed.filters) {
      expect(filter).not.toHaveProperty("source");
      expect(filter).not.toHaveProperty("quantifier");
      expect(filter).not.toHaveProperty("typeIds");
    }
  });
});
