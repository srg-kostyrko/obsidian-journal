import { describe, expect, it } from "vitest";

import { conditionTypeOptions } from "./condition-types";

describe("conditionTypeOptions", () => {
  it.each(Object.entries(conditionTypeOptions))("offers has-notelet for the %s write type", (_writeType, types) => {
    expect(types).toContain("has-notelet");
  });
});
