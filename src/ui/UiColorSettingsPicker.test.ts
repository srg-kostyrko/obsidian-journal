import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import UiColorSettingsPicker from "./UiColorSettingsPicker.vue";

afterEach(() => cleanup());

function lastEmitted(emitted: ReturnType<typeof render>["emitted"]): ColorSettings | undefined {
  const events = emitted<[ColorSettings]>("update:modelValue");
  return events.at(-1)?.[0];
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
    it("emits the selected theme variable name when chosen from the dropdown", async () => {
      const { emitted } = mount({ type: "theme", name: "" });
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: m.ui_color_theme_variable_label() }),
        "text-accent",
      );
      expect(lastEmitted(emitted)).toEqual({ type: "theme", name: "text-accent" });
    });

    it("shows the friendly label for a known theme variable option", () => {
      mount({ type: "theme", name: "" });
      const option = screen.getByRole<HTMLOptionElement>("option", { name: m.ui_theme_color_text_normal() });
      expect(option.value).toBe("text-normal");
    });

    it("keeps a previously stored variable selectable even when it is not a known theme color", () => {
      mount({ type: "theme", name: "my-custom-var" });
      const dropdown = screen.getByRole<HTMLSelectElement>("combobox", { name: m.ui_color_theme_variable_label() });
      expect(dropdown.value).toBe("my-custom-var");
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
