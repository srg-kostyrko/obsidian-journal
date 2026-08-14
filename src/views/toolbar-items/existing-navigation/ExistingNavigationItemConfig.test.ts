import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import { existingNavigationConfigFor } from "./existing-navigation-config";
import ExistingNavigationItemConfig from "./ui/ExistingNavigationItemConfig.vue";

import type { ExistingNavigationConfig, ExistingNavigationConfigChange } from "./existing-navigation-config";

function mountConfig(config: ExistingNavigationConfig, onChange: ExistingNavigationConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(ExistingNavigationItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

// Dropdowns render in order: target, direction.
afterEach(() => cleanup());

describe("ExistingNavigationItemConfig", () => {
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
    mountConfig(existingNavigationConfigFor("day", "next"), vi.fn());
    const [, labelInput] = screen.getAllByRole("textbox");
    expect((labelInput as HTMLInputElement).value).toBe("›");
  });

  it("emits the full config when an appearance field changes", async () => {
    const onChange = vi.fn();
    const config = existingNavigationConfigFor("day", "next");
    mountConfig(config, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.clear(labelInput);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, label: "" });
  });

  it("restores the current direction's label when the label reset is pressed", async () => {
    const onChange = vi.fn();
    const config: ExistingNavigationConfig = { ...existingNavigationConfigFor("day", "next"), label: "‹" };
    mountConfig(config, onChange);
    const labelReset = screen.getByRole("button", { name: m.view_toolbar_appearance_reset({ field: "label" }) });
    await userEvent.click(labelReset);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, label: "›" });
  });
});
