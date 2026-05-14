import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, ref } from "vue";

import UiToggle from "./UiToggle.vue";

function renderHarness(initial: boolean, disabled = false) {
  const model = ref(initial);
  const Host = defineComponent({
    components: { UiToggle },
    props: { disabled: Boolean },
    setup() {
      return { model };
    },
    template: `<UiToggle v-model="model" :disabled="disabled" />`,
  });
  const utilities = render(Host, { props: { disabled } });
  return { ...utilities, model };
}

describe("UiToggle", () => {
  describe("click toggles the v-model", () => {
    it("flips false to true", async () => {
      const { container, model } = renderHarness(false);
      const target = container.querySelector(".checkbox-container");
      expect(target).not.toBeNull();
      await userEvent.click(target!);
      expect(model.value).toBe(true);
    });

    it("flips true to false", async () => {
      const { container, model } = renderHarness(true);
      const target = container.querySelector(".checkbox-container");
      await userEvent.click(target!);
      expect(model.value).toBe(false);
    });
  });

  it("does not toggle when disabled", async () => {
    const { container, model } = renderHarness(false, true);
    const target = container.querySelector(".checkbox-container");
    await userEvent.click(target!);
    expect(model.value).toBe(false);
  });
});
