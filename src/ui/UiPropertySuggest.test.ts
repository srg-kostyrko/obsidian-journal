import { describe, expect, it } from "vitest";

import type { VaultProperty } from "@/infrastructure/host";
import { testContainer, type FakeHost } from "@/testing";

import { icons } from "./icons";
import UiPropertySuggest from "./UiPropertySuggest.vue";

async function mount(modelValue = "", seed: (host: FakeHost) => void = () => undefined) {
  const harness = await testContainer();
  seed(harness.host);
  const utilities = harness.render(UiPropertySuggest, { props: { modelValue } });
  const handle = harness.inputSuggests.handleFor<VaultProperty>(utilities.container.querySelector("input")!);
  return { handle, ...utilities };
}

describe("UiPropertySuggest", () => {
  it("offers the vault properties matching the query", async () => {
    const { handle } = await mount("", (host) => {
      host.setPropertyType("rating", "number");
      host.setPropertyType("due", "date");
    });
    expect(handle.query("").map((property) => property.name)).toEqual(["due", "rating"]);
    expect(handle.query("rat").map((property) => property.name)).toEqual(["rating"]);
  });

  it("labels each suggestion with the icon of its property type", async () => {
    const { handle } = await mount("", (host) => host.setPropertyType("rating", "number"));
    const row = document.createElement("div");
    handle.definition.render(handle.query("rating")[0], row);
    expect(row.textContent).toBe("rating");
    expect(row.querySelector("svg")?.dataset.icon).toBe(icons.propertyType.number);
  });

  it("shows the type icon of the property currently in the field", async () => {
    const { container } = await mount("due", (host) => host.setPropertyType("due", "date"));
    expect(container.querySelector("svg")?.dataset.icon).toBe(icons.propertyType.date);
  });

  it("shows no type icon while the field is empty", async () => {
    const { container } = await mount("", (host) => host.setPropertyType("due", "date"));
    expect(container.querySelector("svg")).toBeNull();
  });
});
