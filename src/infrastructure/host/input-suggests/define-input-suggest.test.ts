import { describe, expect, it } from "vitest";

import { defineInputSuggest } from "./define-input-suggest";

describe("defineInputSuggest", () => {
  it("returns the input fields verbatim plus a __result witness", () => {
    const definition = defineInputSuggest<string>({
      fetch: () => ["a", "b"],
      render: (item, element) => {
        element.setText(item);
      },
      toValue: (item) => item,
    });
    expect(definition.fetch("")).toEqual(["a", "b"]);
    expect(definition.toValue("x")).toBe("x");
    expect(typeof definition.render).toBe("function");
    expect(typeof definition.__result).toBe("function");
  });
});
