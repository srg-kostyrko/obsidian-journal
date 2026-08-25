import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { testContainer } from "@/testing";

import { existingNavigationConfigFor } from "./existing-navigation-config";
import ExistingNavigationItemConfig from "./ui/ExistingNavigationItemConfig.vue";

import type { ExistingNavigationConfig, ExistingNavigationConfigChange } from "./existing-navigation-config";

async function mountConfig(config: ExistingNavigationConfig, onChange: ExistingNavigationConfigChange) {
  const harness = await testContainer();
  return harness.render(ExistingNavigationItemConfig, { props: { config, onChange } });
}

// Dropdowns render in order: target, direction.

describe("ExistingNavigationItemConfig", () => {
  it("emits onChange with the chosen target when the target dropdown changes", async () => {
    const onChange = vi.fn();
    await mountConfig({ target: "day", direction: "next" }, onChange);
    const [targetDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(targetDropdown, "week");
    expect(onChange).toHaveBeenCalledWith({ target: "week", direction: "next" });
  });

  it("emits onChange with previous when the direction dropdown selects previous", async () => {
    const onChange = vi.fn();
    await mountConfig({ target: "day", direction: "next" }, onChange);
    const [, directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "previous");
    expect(onChange).toHaveBeenCalledWith({ target: "day", direction: "previous" });
  });

  it("emits onChange with next when the direction dropdown selects next", async () => {
    const onChange = vi.fn();
    await mountConfig({ target: "day", direction: "previous" }, onChange);
    const [, directionDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(directionDropdown, "next");
    expect(onChange).toHaveBeenCalledWith({ target: "day", direction: "next" });
  });

  it("emits onChange with the active target when active is selected", async () => {
    const onChange = vi.fn();
    await mountConfig({ target: "day", direction: "next" }, onChange);
    const [targetDropdown] = screen.getAllByRole("combobox");
    await userEvent.selectOptions(targetDropdown, "active");
    expect(onChange).toHaveBeenCalledWith({ target: "active", direction: "next" });
  });

  it("shows the direction's seeded label in the label field", async () => {
    await mountConfig(existingNavigationConfigFor("day", "next"), vi.fn());
    const [, labelInput] = screen.getAllByRole("textbox");
    expect((labelInput as HTMLInputElement).value).toBe("›");
  });

  it("emits the full config when an appearance field changes", async () => {
    const onChange = vi.fn();
    const config = existingNavigationConfigFor("day", "next");
    await mountConfig(config, onChange);
    const [, labelInput] = screen.getAllByRole("textbox");
    await userEvent.clear(labelInput);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, label: "" });
  });

  it("restores the current direction's label when the label reset is pressed", async () => {
    const onChange = vi.fn();
    const config: ExistingNavigationConfig = { ...existingNavigationConfigFor("day", "next"), label: "‹" };
    await mountConfig(config, onChange);
    const labelReset = screen.getByRole("button", { name: m.view_toolbar_appearance_reset({ field: "label" }) });
    await userEvent.click(labelReset);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, label: "›" });
  });
});
