import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { icons } from "@/ui/icons";

import ButtonItemConfig from "./ui/ButtonItemConfig.vue";

import type { ButtonConfig, ButtonConfigChange } from "./button-config";

function mountConfig(config: ButtonConfig, onChange: ButtonConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  return render(ButtonItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const baseConfig: ButtonConfig = {
  action: { type: "current", mode: "create", levels: ["day"] },
};

afterEach(() => cleanup());

describe("ButtonItemConfig", () => {
  it("emits onChange with the new icon when the icon input changes", async () => {
    const onChange = vi.fn();
    mountConfig(baseConfig, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    await userEvent.type(iconInput, "star");
    expect(onChange).toHaveBeenLastCalledWith({ ...baseConfig, icon: "star" });
  });

  it("emits onChange with the new label when the label input changes", async () => {
    const onChange = vi.fn();
    mountConfig(baseConfig, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Go");
    expect(onChange).toHaveBeenLastCalledWith({ ...baseConfig, label: "Go" });
  });

  it("emits onChange with the new tooltip when the tooltip input changes", async () => {
    const onChange = vi.fn();
    mountConfig(baseConfig, onChange);
    const [, , tooltipInput] = screen.getAllByRole("textbox");
    await userEvent.clear(tooltipInput);
    await userEvent.type(tooltipInput, "Press");
    expect(onChange).toHaveBeenLastCalledWith({ ...baseConfig, tooltip: "Press" });
  });

  it("clears the field (sets undefined) when input is emptied", async () => {
    const onChange = vi.fn();
    mountConfig({ ...baseConfig, icon: "star" }, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.clear(iconInput);
    expect(onChange).toHaveBeenLastCalledWith({ ...baseConfig, icon: undefined });
  });

  describe("default display", () => {
    it("shows the action's default icon as the icon-field placeholder", () => {
      mountConfig({ action: { type: "pick-date", mode: "navigate", levels: ["day"] } }, vi.fn());
      expect(screen.getByPlaceholderText(icons.action.pickDate)).toBeTruthy();
    });

    it("shows the action's default tooltip as the tooltip-field placeholder", () => {
      mountConfig({ action: { type: "pick-date", mode: "navigate", levels: ["day"] } }, vi.fn());
      expect(screen.getByPlaceholderText(m.common_pick_a_date())).toBeTruthy();
    });
  });

  describe("action mode", () => {
    it("emits onChange with the selected mode when the behavior dropdown changes", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      await userEvent.selectOptions(screen.getByRole("combobox"), "navigate");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "navigate", levels: ["day"] },
      });
    });
  });

  describe("action levels", () => {
    it("adds a period level when its toggle is enabled", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Week" }));
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["day", "week"] },
      });
    });

    it("orders enabled levels canonically regardless of toggle order", async () => {
      const onChange = vi.fn();
      mountConfig({ action: { type: "current", mode: "create", levels: ["month"] } }, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Day" }));
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["day", "month"] },
      });
    });

    it("removes a period level when its toggle is disabled", async () => {
      const onChange = vi.fn();
      mountConfig({ action: { type: "current", mode: "create", levels: ["day", "week"] } }, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Day" }));
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["week"] },
      });
    });

    it("keeps the last remaining level when its toggle is disabled", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Day" }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("navigate-step action", () => {
    const stepConfig: ButtonConfig = {
      action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
    };

    it("renders no period-level toggles", () => {
      mountConfig(stepConfig, vi.fn());
      expect(screen.queryByRole("button", { name: "Day" })).toBeNull();
    });

    it("renders exactly the direction and granularity dropdowns", () => {
      mountConfig(stepConfig, vi.fn());
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("emits onChange with the selected direction when the direction dropdown changes", async () => {
      const onChange = vi.fn();
      mountConfig(stepConfig, onChange);
      const [directionDropdown] = screen.getAllByRole("combobox");
      await userEvent.selectOptions(directionDropdown, "prev");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 },
      });
    });

    it("emits onChange with the selected granularity when the granularity dropdown changes", async () => {
      const onChange = vi.fn();
      mountConfig(stepConfig, onChange);
      const [, granularityDropdown] = screen.getAllByRole("combobox");
      await userEvent.selectOptions(granularityDropdown, "quarter");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "navigate-step", direction: "next", unit: "quarter", amount: 1 },
      });
    });
  });
});
