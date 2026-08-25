import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import PeriodButtonsItemConfig from "./ui/PeriodButtonsItemConfig.vue";

import type { PeriodButtonsConfig, PeriodButtonsConfigChange } from "./period-buttons-item";

function mountConfig(config: PeriodButtonsConfig, onChange: PeriodButtonsConfigChange) {
  return render(PeriodButtonsItemConfig, { props: { config, onChange } });
}

describe("PeriodButtonsItemConfig", () => {
  it("emits onChange when the week period is toggled on", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getByRole("button", { name: "Show week" }));
    expect(onChange).toHaveBeenCalledWith({ week: true, month: true, quarter: true, year: true });
  });

  it("emits onChange when the month period is toggled off", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getByRole("button", { name: "Show month" }));
    expect(onChange).toHaveBeenCalledWith({ week: false, month: false, quarter: true, year: true });
  });

  it("emits onChange when the quarter period is toggled off", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getByRole("button", { name: "Show quarter" }));
    expect(onChange).toHaveBeenCalledWith({ week: false, month: true, quarter: false, year: true });
  });

  it("emits onChange when the year period is toggled off", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getByRole("button", { name: "Show year" }));
    expect(onChange).toHaveBeenCalledWith({ week: false, month: true, quarter: true, year: false });
  });
});
