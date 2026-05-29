import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import ButtonItemConfig from "./ui/ButtonItemConfig.vue";

import type { ButtonConfig, ButtonConfigChange } from "./button-config";

function mountConfig(config: ButtonConfig, onChange: ButtonConfigChange) {
  return render(ButtonItemConfig, { props: { config, onChange } });
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
});
