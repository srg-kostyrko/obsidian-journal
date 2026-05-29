import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import PeriodButtonsItemConfig from "./ui/PeriodButtonsItemConfig.vue";

import type { PeriodButtonsConfig, PeriodButtonsConfigChange } from "./period-buttons-item";

function mountConfig(config: PeriodButtonsConfig, onChange: PeriodButtonsConfigChange) {
  return render(PeriodButtonsItemConfig, { props: { config, onChange } });
}

// Toggles render in order: week, month, quarter, year.
const TOGGLE_INDEX = { week: 0, month: 1, quarter: 2, year: 3 } as const;

afterEach(() => cleanup());

describe("PeriodButtonsItemConfig", () => {
  it("emits onChange when the week toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getAllByRole("checkbox")[TOGGLE_INDEX.week]);
    expect(onChange).toHaveBeenCalledWith({ week: true, month: true, quarter: true, year: true });
  });

  it("emits onChange when the month toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getAllByRole("checkbox")[TOGGLE_INDEX.month]);
    expect(onChange).toHaveBeenCalledWith({ week: false, month: false, quarter: true, year: true });
  });

  it("emits onChange when the quarter toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getAllByRole("checkbox")[TOGGLE_INDEX.quarter]);
    expect(onChange).toHaveBeenCalledWith({ week: false, month: true, quarter: false, year: true });
  });

  it("emits onChange when the year toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ week: false, month: true, quarter: true, year: true }, onChange);
    await userEvent.click(screen.getAllByRole("checkbox")[TOGGLE_INDEX.year]);
    expect(onChange).toHaveBeenCalledWith({ week: false, month: true, quarter: true, year: false });
  });
});
