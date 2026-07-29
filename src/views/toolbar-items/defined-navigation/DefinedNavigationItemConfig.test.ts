import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import { definedNavigationConfigFor } from "./defined-navigation-config";
import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "./defined-navigation-config";

function mountConfig(config: DefinedNavigationConfig, onChange: DefinedNavigationConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(DefinedNavigationItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

// Dropdowns render in order: target, direction.
afterEach(() => cleanup());

describe("DefinedNavigationItemConfig", () => {
  it("emits onChange with the chosen target when the target dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [targetDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(targetDropdown, "week");
    expect(onChange).toHaveBeenCalledWith({ target: "week", direction: "next" });
  });

  it("emits onChange with previous when the direction dropdown selects previous", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [, directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "previous");
    expect(onChange).toHaveBeenCalledWith({ target: "day", direction: "previous" });
  });

  it("emits onChange with next when the direction dropdown selects next", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "previous" }, onChange);
    const [, directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "next");
    expect(onChange).toHaveBeenCalledWith({ target: "day", direction: "next" });
  });

  it("emits onChange with the active target when active is selected", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [targetDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(targetDropdown, "active");
    expect(onChange).toHaveBeenCalledWith({ target: "active", direction: "next" });
  });

  it("shows the direction's seeded label in the label field", () => {
    mountConfig(definedNavigationConfigFor("day", "next"), vi.fn());
    const [, labelInput] = screen.getAllByRole("textbox");
    expect((labelInput as HTMLInputElement).value).toBe("›");
  });

  it("emits the full config when an appearance field changes", async () => {
    const onChange = vi.fn();
    const config = definedNavigationConfigFor("day", "next");
    mountConfig(config, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.clear(labelInput);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, label: "" });
  });
});
