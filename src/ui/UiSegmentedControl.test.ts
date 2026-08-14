import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiSegmentedControl from "./UiSegmentedControl.vue";

afterEach(() => cleanup());

const options = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
];

describe("UiSegmentedControl", () => {
  it("renders a radio for each option", () => {
    render(UiSegmentedControl, { props: { modelValue: "alpha", options } });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("checks the option matching the model", () => {
    render(UiSegmentedControl, { props: { modelValue: "beta", options } });
    expect(screen.getByRole("radio", { name: "Beta", checked: true })).toBeTruthy();
  });

  it("emits the value of the clicked option", async () => {
    const { emitted } = render(UiSegmentedControl, { props: { modelValue: "beta", options } });
    await userEvent.click(screen.getByRole("radio", { name: "Alpha" }));
    expect(emitted("update:modelValue")).toEqual([["alpha"]]);
  });

  it("names the group from a fallthrough aria-label", () => {
    render(UiSegmentedControl, { props: { modelValue: "alpha", options, "aria-label": "Count from" } });
    expect(screen.getByRole("radiogroup", { name: "Count from" })).toBeTruthy();
  });

  it("disables every option when disabled", () => {
    render(UiSegmentedControl, { props: { modelValue: "alpha", options, disabled: true } });
    for (const radio of screen.getAllByRole<HTMLInputElement>("radio")) {
      expect(radio.disabled).toBe(true);
    }
  });
});
