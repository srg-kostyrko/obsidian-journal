import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import UiColorSettingsPicker from "./UiColorSettingsPicker.vue";

import type { ThemeColorFieldRole } from "./theme-colors";

function lastEmitted(emitted: ReturnType<typeof render>["emitted"]): ColorSettings | undefined {
  const events = emitted<[ColorSettings]>("update:modelValue");
  return events.at(-1)?.[0];
}

function mount(initial: ColorSettings, role: ThemeColorFieldRole = "text") {
  return render(UiColorSettingsPicker, { props: { modelValue: initial, role } });
}

function themeDropdown(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: m.ui_color_theme_variable_label() });
}

function mountUnchanged(initial: ColorSettings | "unchanged", unchanged = true) {
  return render(UiColorSettingsPicker, { props: { modelValue: initial, role: "text", unchanged } });
}

function mountDefault(initial: ColorSettings | null, withDefault = true) {
  return render(UiColorSettingsPicker, { props: { modelValue: initial, role: "text", default: withDefault } });
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
      await userEvent.selectOptions(themeDropdown(), "text-accent");
      expect(lastEmitted(emitted)).toEqual({ type: "theme", name: "text-accent" });
    });

    it("shows the friendly label for a known theme variable option", () => {
      mount({ type: "theme", name: "" });
      const option = screen.getByRole<HTMLOptionElement>("option", { name: m.ui_theme_color_text_normal() });
      expect(option.value).toBe("text-normal");
    });

    it("keeps a previously stored variable selectable even when it is not a known theme color", () => {
      mount({ type: "theme", name: "my-custom-var" });
      expect(themeDropdown().value).toBe("my-custom-var");
    });

    describe("field role", () => {
      it("omits a variable outside the field's role", () => {
        mount({ type: "theme", name: "" }, "text");
        expect(screen.queryByRole("option", { name: m.ui_theme_color_background_primary() })).toBeNull();
      });

      it("offers a variable matching the field's role", () => {
        mount({ type: "theme", name: "" }, "background");
        const option = screen.getByRole<HTMLOptionElement>("option", {
          name: m.ui_theme_color_background_primary(),
        });
        expect(option.value).toBe("background-primary");
      });

      it("renders no group headings for a single-tag role", () => {
        mount({ type: "theme", name: "" }, "text");
        expect(screen.queryAllByRole("group")).toHaveLength(0);
      });

      it("renders a heading for the border tag of a two-tag role", () => {
        mount({ type: "theme", name: "" }, "border");
        expect(screen.getByRole("group", { name: m.ui_theme_color_group_label({ group: "border" }) })).toBeTruthy();
      });

      it("renders a heading for the text tag of a two-tag role", () => {
        mount({ type: "theme", name: "" }, "border");
        expect(screen.getByRole("group", { name: m.ui_theme_color_group_label({ group: "text" }) })).toBeTruthy();
      });

      it("keeps a stored variable selected even when the field's role excludes it", () => {
        mount({ type: "theme", name: "background-primary" }, "text");
        expect(themeDropdown().value).toBe("background-primary");
      });

      it("labels a stored variable the field's role excludes with its friendly name", () => {
        mount({ type: "theme", name: "background-primary" }, "text");
        const option = screen.getByRole<HTMLOptionElement>("option", {
          name: m.ui_theme_color_background_primary(),
        });
        expect(option.value).toBe("background-primary");
      });
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

  describe("unchanged choice", () => {
    it("offers Unchanged only when asked", () => {
      const label = m.ui_color_kind_label({ kind: "unchanged" });
      const { unmount } = mountUnchanged({ type: "transparent" });
      expect(screen.getByRole("option", { name: label })).toBeTruthy();
      unmount();
      mountUnchanged({ type: "transparent" }, false);
      expect(screen.queryByRole("option", { name: label })).toBeNull();
    });

    it("emits the literal when Unchanged is chosen", async () => {
      const { emitted } = mountUnchanged({ type: "custom", color: "#ff0000" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "unchanged");
      expect(emitted<[unknown]>("update:modelValue").at(-1)?.[0]).toBe("unchanged");
    });

    it("emits an empty theme value when Theme is chosen from Unchanged", async () => {
      const { emitted } = mountUnchanged("unchanged");
      await userEvent.selectOptions(screen.getByRole("combobox"), "theme");
      expect(emitted<[unknown]>("update:modelValue").at(-1)?.[0]).toEqual({ type: "theme", name: "" });
    });

    it("shows no swatch and no theme select for an Unchanged model", () => {
      mountUnchanged("unchanged");
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
      expect(document.querySelector(".ui-color-settings-picker__swatch")).toBeNull();
      expect(document.querySelector('input[type="color"]')).toBeNull();
    });
  });

  describe("default choice", () => {
    it("offers Default only when asked", () => {
      const label = m.ui_color_kind_label({ kind: "default" });
      const { unmount } = mountDefault({ type: "transparent" });
      expect(screen.getByRole("option", { name: label })).toBeTruthy();
      unmount();
      mountDefault({ type: "transparent" }, false);
      expect(screen.queryByRole("option", { name: label })).toBeNull();
    });

    it("emits null when Default is chosen", async () => {
      const { emitted } = mountDefault({ type: "custom", color: "#ff0000" });
      await userEvent.selectOptions(screen.getByRole("combobox"), "default");
      expect(emitted<[unknown]>("update:modelValue").at(-1)?.[0]).toBeNull();
    });

    it("shows a null model as Default", () => {
      mountDefault(null);
      expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("default");
    });

    it("emits an empty theme value when Theme is chosen from Default", async () => {
      const { emitted } = mountDefault(null);
      await userEvent.selectOptions(screen.getByRole("combobox"), "theme");
      expect(emitted<[unknown]>("update:modelValue").at(-1)?.[0]).toEqual({ type: "theme", name: "" });
    });

    it("shows no swatch and no theme select for a Default model", () => {
      mountDefault(null);
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
      expect(document.querySelector(".ui-color-settings-picker__swatch")).toBeNull();
      expect(document.querySelector('input[type="color"]')).toBeNull();
    });

    it("shows a swatch of the default color for a Default model when it is given one", () => {
      render(UiColorSettingsPicker, {
        props: { modelValue: null, role: "text", default: true, defaultColor: "rgb(18, 52, 86)" },
      });
      const swatch = document.querySelector<HTMLElement>(".ui-color-settings-picker__swatch");
      expect(swatch?.style.backgroundColor).toBe("rgb(18, 52, 86)");
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
    });

    it("shows no default swatch once another kind is chosen", () => {
      render(UiColorSettingsPicker, {
        props: { modelValue: { type: "transparent" }, role: "text", default: true, defaultColor: "rgb(18, 52, 86)" },
      });
      expect(document.querySelector(".ui-color-settings-picker__swatch")).toBeNull();
    });
  });
});
