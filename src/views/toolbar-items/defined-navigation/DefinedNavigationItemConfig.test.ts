import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "./defined-navigation-item";

function mountConfig(config: DefinedNavigationConfig, onChange: DefinedNavigationConfigChange) {
  return render(DefinedNavigationItemConfig, { props: { config, onChange } });
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
});
