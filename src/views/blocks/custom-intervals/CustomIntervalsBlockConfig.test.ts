import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";

import {
  customIntervalsBlock,
  type CustomIntervalsConfig,
  type CustomIntervalsConfigChange,
} from "./custom-intervals-block";
import CustomIntervalsBlockConfig from "./ui/CustomIntervalsBlockConfig.vue";

function mountConfig(config: CustomIntervalsConfig, onChange: CustomIntervalsConfigChange) {
  return render(CustomIntervalsBlockConfig, { props: { config, onChange } });
}

describe("CustomIntervalsBlockConfig", () => {
  it("emits onChange with the chosen window when the dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig({ window: "month" }, onChange);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "quarter");
    expect(onChange).toHaveBeenLastCalledWith({ window: "quarter" });
  });

  it("normalizes a legacy current-* window value to the bare period kind", () => {
    const parsed = v.parse(customIntervalsBlock.schema, { window: "current-quarter" });
    expect(parsed.window).toBe("quarter");
  });
});
