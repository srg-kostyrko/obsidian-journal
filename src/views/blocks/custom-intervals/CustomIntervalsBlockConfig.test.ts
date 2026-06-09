import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  customIntervalsBlock,
  type CustomIntervalsConfig,
  type CustomIntervalsConfigChange,
} from "./custom-intervals-block";
import CustomIntervalsBlockConfig from "./ui/CustomIntervalsBlockConfig.vue";

function mountConfig(config: CustomIntervalsConfig, onChange: CustomIntervalsConfigChange) {
  return render(CustomIntervalsBlockConfig, { props: { config, onChange } });
}

afterEach(() => cleanup());

describe("CustomIntervalsBlockConfig", () => {
  it("emits onChange with the chosen window when the dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig({ window: "month", hideEmpty: true }, onChange);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "quarter");
    expect(onChange).toHaveBeenLastCalledWith({ window: "quarter", hideEmpty: true });
  });

  it("emits onChange when hideEmpty toggles", async () => {
    const onChange = vi.fn();
    mountConfig({ window: "month", hideEmpty: true }, onChange);
    const toggle = screen.getByRole("checkbox");
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ window: "month", hideEmpty: false });
  });

  it("normalizes a legacy current-* window value to the bare period kind", () => {
    const parsed = v.parse(customIntervalsBlock.schema, { window: "current-quarter", hideEmpty: false });
    expect(parsed.window).toBe("quarter");
  });
});
