import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import UiSlider from "./UiSlider.vue";

const range = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("slider");

describe("UiSlider", () => {
  it("is Obsidian's own slider with the given bounds and the model's value", () => {
    render(UiSlider, { props: { modelValue: 3, min: 1, max: 4, step: 1 } });

    expect(range().type).toBe("range");
    expect(range().classList.contains("slider")).toBe(true);
    expect([range().min, range().max, range().step, range().value]).toEqual(["1", "4", "1", "3"]);
  });

  it("emits a number while it moves", async () => {
    const { emitted } = render(UiSlider, { props: { modelValue: 0.5, min: 0.5, max: 1.6, step: 0.05 } });

    await fireEvent.update(range(), "0.65");

    expect(emitted("update:modelValue")).toEqual([[0.65]]);
  });

  it("fills the track up to its value, the way Obsidian's own slider does", () => {
    render(UiSlider, { props: { modelValue: 3, min: 1, max: 5, step: 1 } });

    expect(range().style.getPropertyValue("--slider-fill-ratio")).toBe("0.5");
  });

  it("takes its accessible name from the label", () => {
    render(UiSlider, { props: { modelValue: 0, min: 0, max: 8, step: 1, label: "Gap" } });

    expect(screen.getByRole("slider", { name: "Gap" })).toBeTruthy();
  });
});
