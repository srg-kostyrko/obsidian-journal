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

describe("UiTemplateInput", () => {
  it("offers template candidate paths filtered by query", () => {
    const { inputSuggest, container } = build();
    render(UiTemplateInput, {
      props: { modelValue: "", "onUpdate:modelValue": vi.fn() },
      global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
    });
    const handle = inputSuggest.attachments[0];
    expect(handle.query("").toSorted()).toEqual(["templates/daily.md", "templates/weekly.md"]);
    expect(handle.query("weekly")).toEqual(["templates/weekly.md"]);
  });
});
