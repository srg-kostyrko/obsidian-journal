import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, MetadataTypeService, type VaultProperty } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { createFakeHost, type FakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";

import { icons } from "./icons";
import UiPropertySuggest from "./UiPropertySuggest.vue";

afterEach(() => cleanup());

function mount(modelValue = "", seed: (host: FakeHost) => void = () => undefined) {
  const host = createFakeHost();
  seed(host);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(InternalObsidianAppToken).useValue(host.app);
  container.register(MetadataTypeService).useClass(MetadataTypeService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  const utilities = render(UiPropertySuggest, {
    props: { modelValue },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  const handle = inputSuggest.handleFor<VaultProperty>(utilities.container.querySelector("input")!);
  return { handle, ...utilities };
}

describe("UiPropertySuggest", () => {
  it("offers the vault properties matching the query", () => {
    const { handle } = mount("", (host) => {
      host.setPropertyType("rating", "number");
      host.setPropertyType("due", "date");
    });
    expect(handle.query("").map((property) => property.name)).toEqual(["due", "rating"]);
    expect(handle.query("rat").map((property) => property.name)).toEqual(["rating"]);
  });

  it("labels each suggestion with the icon of its property type", () => {
    const { handle } = mount("", (host) => host.setPropertyType("rating", "number"));
    const row = document.createElement("div");
    handle.definition.render(handle.query("rating")[0], row);
    expect(row.textContent).toBe("rating");
    expect(row.querySelector("svg")?.dataset.icon).toBe(icons.propertyType.number);
  });

  it("shows the type icon of the property currently in the field", () => {
    const { container } = mount("due", (host) => host.setPropertyType("due", "date"));
    expect(container.querySelector("svg")?.dataset.icon).toBe(icons.propertyType.date);
  });

  it("shows no type icon while the field is empty", () => {
    const { container } = mount("", (host) => host.setPropertyType("due", "date"));
    expect(container.querySelector("svg")).toBeNull();
  });
});
