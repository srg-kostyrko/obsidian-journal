import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import DefinedNavigationItemConfig from "./ui/DefinedNavigationItemConfig.vue";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "./defined-navigation-item";

function mountConfig(config: DefinedNavigationConfig, onChange: DefinedNavigationConfigChange) {
  return render(DefinedNavigationItemConfig, { props: { config, onChange } });
}

// Toggles render in order: previous, next.
const TOGGLE_INDEX = { previous: 0, next: 1 } as const;

afterEach(() => cleanup());

describe("DefinedNavigationItemConfig", () => {
  it("emits onChange with the chosen target when the dropdown changes", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", previous: true, next: true }, onChange);
    await userEvent.selectOptions(screen.getByRole("combobox"), "week");
    expect(onChange).toHaveBeenCalledWith({ target: "week", previous: true, next: true });
  });

  it("emits onChange when the previous toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", previous: true, next: true }, onChange);
    await userEvent.click(screen.getAllByRole("checkbox")[TOGGLE_INDEX.previous]);
    expect(onChange).toHaveBeenCalledWith({ target: "day", previous: false, next: true });
  });

  it("emits onChange when the next toggle is flipped", async () => {
    const onChange = vi.fn();
    mountConfig({ target: "day", previous: true, next: true }, onChange);
    await userEvent.click(screen.getAllByRole("checkbox")[TOGGLE_INDEX.next]);
    expect(onChange).toHaveBeenCalledWith({ target: "day", previous: true, next: false });
  });
});
