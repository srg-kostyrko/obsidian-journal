import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiToggleGroup from "./UiToggleGroup.vue";

afterEach(() => cleanup());

const options = [
  { value: 1, label: "One" },
  { value: 2, label: "Two" },
  { value: 3, label: "Three" },
];

describe("UiToggleGroup", () => {
  it("renders a button for each option", () => {
    render(UiToggleGroup, { props: { modelValue: [], options } });
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks options present in the model as pressed", () => {
    render(UiToggleGroup, { props: { modelValue: [2], options } });
    expect(screen.getByRole("button", { name: "Two", pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "One", pressed: false })).toBeTruthy();
  });

  it("adds an option's value to the model when an unpressed option is clicked", async () => {
    const { emitted } = render(UiToggleGroup, { props: { modelValue: [1], options } });
    await userEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(emitted("update:modelValue")).toEqual([[[1, 2]]]);
  });

  it("removes an option's value from the model when a pressed option is clicked", async () => {
    const { emitted } = render(UiToggleGroup, { props: { modelValue: [1, 2], options } });
    await userEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(emitted("update:modelValue")).toEqual([[[1]]]);
  });
});
