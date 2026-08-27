import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";

import UiSegmentedControl from "./UiSegmentedControl.vue";

const options = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
];

const nameOf = (group: HTMLElement) => group.querySelector("input[type=radio]")?.getAttribute("name");

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

  it("gives each instance its own radio group", () => {
    const TwoInstances = defineComponent({
      components: { UiSegmentedControl },
      setup() {
        return { options };
      },
      template: `
        <UiSegmentedControl model-value="alpha" :options="options" />
        <UiSegmentedControl model-value="alpha" :options="options" />
      `,
    });

    render(TwoInstances);

    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(2);

    const firstName = nameOf(groups[0]);
    const secondName = nameOf(groups[1]);

    expect(firstName).toEqual(expect.any(String));
    expect(firstName).not.toBe("");
    expect(secondName).toEqual(expect.any(String));
    expect(secondName).not.toBe("");
    expect(firstName).not.toBe(secondName);
  });
});
