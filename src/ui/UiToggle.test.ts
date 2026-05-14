import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiToggle from "./UiToggle.vue";

afterEach(() => cleanup());

describe("UiToggle", () => {
  describe("click toggles the v-model", () => {
    it("emits update:modelValue(true) when current value is false", async () => {
      const { container, emitted } = render(UiToggle, { props: { modelValue: false } });
      await userEvent.click(container.querySelector(".checkbox-container")!);
      expect(emitted("update:modelValue")).toEqual([[true]]);
    });

    it("emits update:modelValue(false) when current value is true", async () => {
      const { container, emitted } = render(UiToggle, { props: { modelValue: true } });
      await userEvent.click(container.querySelector(".checkbox-container")!);
      expect(emitted("update:modelValue")).toEqual([[false]]);
    });
  });

  it("does not emit update:modelValue when disabled", async () => {
    const { container, emitted } = render(UiToggle, { props: { modelValue: false, disabled: true } });
    await userEvent.click(container.querySelector(".checkbox-container")!);
    expect(emitted("update:modelValue")).toBeUndefined();
  });
});
