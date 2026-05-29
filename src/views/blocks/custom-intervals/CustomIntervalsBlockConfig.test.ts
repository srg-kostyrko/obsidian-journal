import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import CustomIntervalsBlockConfig from "./ui/CustomIntervalsBlockConfig.vue";

import type { CustomIntervalsConfig, CustomIntervalsConfigChange } from "./custom-intervals-block";

function mountConfig(config: CustomIntervalsConfig, onChange: CustomIntervalsConfigChange) {
  return render(CustomIntervalsBlockConfig, { props: { config, onChange } });
}

afterEach(() => cleanup());

describe("CustomIntervalsBlockConfig", () => {
  it("emits onChange with the chosen window when the dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig({ window: "current-month", hideEmpty: true }, onChange);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "current-quarter");
    expect(onChange).toHaveBeenLastCalledWith({ window: "current-quarter", hideEmpty: true });
  });

  it("emits onChange when hideEmpty toggles", async () => {
    const onChange = vi.fn();
    mountConfig({ window: "current-month", hideEmpty: true }, onChange);
    const toggle = screen.getByRole("checkbox");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ window: "current-month", hideEmpty: false });
  });
});
