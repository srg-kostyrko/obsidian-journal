import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import type { ColorSettings } from "@/decorations";

import UiColorSettingsPicker from "./UiColorSettingsPicker.vue";

afterEach(() => cleanup());

function lastEmitted(emitted: ReturnType<typeof render>["emitted"]): ColorSettings | undefined {
  const events = emitted("update:modelValue");
  const last = events.at(-1);
  return last?.[0] as ColorSettings | undefined;
}

function mount(initial: ColorSettings) {
  return render(UiColorSettingsPicker, { props: { modelValue: initial } });
}

describe("UiColorSettingsPicker", () => {
  describe("kind selection", () => {
    it("emits a transparent value when switched to transparent", async () => {
      const { emitted } = mount({ type: "custom", color: "#ff0000" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "transparent");
      expect(lastEmitted(emitted)).toEqual({ type: "transparent" });
    });

    it("emits a theme value with an empty name when switched to theme", async () => {
      const { emitted } = mount({ type: "transparent" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "theme");
      expect(lastEmitted(emitted)).toEqual({ type: "theme", name: "" });
    });

    it("emits a custom value with a default color when switched to custom", async () => {
      const { emitted } = mount({ type: "transparent" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
      expect(lastEmitted(emitted)).toEqual({ type: "custom", color: "#000000" });
    });
  });

  describe("theme variant", () => {
    it("emits an updated theme variable name as the user types", async () => {
      const { emitted } = mount({ type: "theme", name: "" });
      await userEvent.type(screen.getByRole("textbox"), "x");
      expect(lastEmitted(emitted)).toEqual({ type: "theme", name: "x" });
    });
  });

  describe("custom variant", () => {
    it("emits an updated color when a new color is set", () => {
      const { emitted } = mount({ type: "custom", color: "#000000" });
      const input = document.querySelector<HTMLInputElement>('input[type="color"]')!;
      input.value = "#abcdef";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(lastEmitted(emitted)).toEqual({ type: "custom", color: "#abcdef" });
    });
  });
});
