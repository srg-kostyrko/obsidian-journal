import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiToggle from "./UiToggle.vue";

afterEach(() => cleanup());

describe("UiToggle", () => {
  describe("assistive tech", () => {
    it("reports itself as checked when the model is true", () => {
      render(UiToggle, { props: { modelValue: true } });
      expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    });

    it("reports itself as unchecked when the model is false", () => {
      render(UiToggle, { props: { modelValue: false } });
      expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("false");
    });

    it("takes its accessible name from the tooltip", () => {
      render(UiToggle, { props: { modelValue: false, tooltip: "Move file into the journal's folder" } });
      expect(screen.getByRole("checkbox", { name: "Move file into the journal's folder" })).toBeTruthy();
    });

    it("is reachable by keyboard", async () => {
      render(UiToggle, { props: { modelValue: false } });
      await userEvent.tab();
      expect(document.activeElement).toBe(screen.getByRole("checkbox"));
    });

    it("toggles on the space key", async () => {
      const { emitted } = render(UiToggle, { props: { modelValue: false } });
      await userEvent.tab();
      await userEvent.keyboard(" ");
      expect(emitted("update:modelValue")).toEqual([[true]]);
    });

    it("is not reachable by keyboard when disabled", async () => {
      render(UiToggle, { props: { modelValue: false, disabled: true } });
      await userEvent.tab();
      expect(document.activeElement).not.toBe(screen.getByRole("checkbox"));
    });
  });

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
