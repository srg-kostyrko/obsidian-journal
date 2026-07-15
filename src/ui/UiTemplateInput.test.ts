import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, TemplatesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import UiTemplateInput from "./UiTemplateInput.vue";

afterEach(() => cleanup());

function build() {
  const templates = {
    candidatePaths: () => ["templates/daily.md", "templates/weekly.md"],
  } as unknown as TemplatesService;
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(TemplatesService).useValue(templates);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return { inputSuggest, container };
}

function mountHandle() {
  const { inputSuggest, container } = build();
  render(UiTemplateInput, {
    props: { modelValue: "", "onUpdate:modelValue": vi.fn() },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return inputSuggest.attachments[0];
}

describe("UiTemplateInput", () => {
  it("offers no suggestions for an empty query", () => {
    // v2's template suggester returned [] on empty input rather than popping the full path list.
    expect(mountHandle().query("")).toEqual([]);
  });

  it("filters candidate paths by query", () => {
    expect(mountHandle().query("weekly")).toEqual(["templates/weekly.md"]);
  });
});
