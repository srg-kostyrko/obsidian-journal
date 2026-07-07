import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "./defined-navigation-item";

function mountConfig(config: DefinedNavigationConfig, onChange: DefinedNavigationConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(DefinedNavigationItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

// Text inputs render in order: icon, label, tooltip.
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

  it("emits onChange with the new icon when the icon input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    await userEvent.type(iconInput, "star");
    expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", icon: "star" });
  });

  it("emits onChange with the new label when the label input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Older");
    expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", label: "Older" });
  });

  it("emits onChange with the new tooltip when the tooltip input changes", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next" }, onChange);
    const [, , tooltipInput] = screen.getAllByRole("textbox");
    await userEvent.clear(tooltipInput);
    await userEvent.type(tooltipInput, "Jump");
    expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", tooltip: "Jump" });
  });

  it("clears the label (sets undefined) when the label input is emptied", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", direction: "next", label: "Older" }, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.clear(labelInput);
    expect(onChange).toHaveBeenLastCalledWith({ target: "day", direction: "next", label: undefined });
  });

  it("shows the chevron as the label-field placeholder", () => {
    mountConfig({ target: "day", direction: "next" }, vi.fn());
    expect(screen.getByPlaceholderText("›")).toBeTruthy();
  });

  it("shows the default tooltip as the tooltip-field placeholder", () => {
    mountConfig({ target: "day", direction: "next" }, vi.fn());
    expect(screen.getByPlaceholderText(m.command_open_next())).toBeTruthy();
  });
});
