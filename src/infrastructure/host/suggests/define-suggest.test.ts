import { describe, it, expect, vi } from "vitest";

import { defineSuggest } from "./define-suggest";

describe("defineSuggest", () => {
  it("returns a definition with fetch and render passed through", () => {
    const fetch = vi.fn(() => []);
    const render = vi.fn();
    const definition = defineSuggest<string[], string>({ fetch, render });
    expect(definition.fetch).toBe(fetch);
    expect(definition.render).toBe(render);
    expect(definition.placeholder).toBeUndefined();
  });

  it("preserves the placeholder function when supplied", () => {
    const placeholder = vi.fn(() => "type a name");
    const definition = defineSuggest<string[], string>({
      fetch: () => [],
      render: () => undefined,
      placeholder,
    });
    expect(definition.placeholder).toBe(placeholder);
  });
});
