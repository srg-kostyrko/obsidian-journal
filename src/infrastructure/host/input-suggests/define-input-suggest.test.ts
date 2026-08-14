import { describe, expect, it } from "vitest";

import { defineInputSuggest } from "./define-input-suggest";

const renderStub = (item: string, element: HTMLElement) => {
  element.setText(item);
  return undefined;
};

describe("defineInputSuggest", () => {
  it("forwards fetch to the supplied callback", () => {
    const definition = defineInputSuggest<string>({
      fetch: () => ["a", "b"],
      render: () => undefined,
      toValue: (item) => item,
    });
    expect(definition.fetch("")).toEqual(["a", "b"]);
  });

  it("forwards toValue to the supplied callback", () => {
    const definition = defineInputSuggest<string>({
      fetch: () => [],
      render: () => undefined,
      toValue: (item) => `[${item}]`,
    });
    expect(definition.toValue("x")).toBe("[x]");
  });

  it("exposes the supplied render callback", () => {
    const definition = defineInputSuggest<string>({
      fetch: () => [],
      render: renderStub,
      toValue: (item) => item,
    });
    expect(definition.render).toBe(renderStub);
  });
});
