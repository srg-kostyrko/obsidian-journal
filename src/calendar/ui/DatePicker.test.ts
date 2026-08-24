import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { DayPeriod, type OpenInterval, type Period } from "@/calendar";
import { date } from "@/calendar/testing";
import { m } from "@/i18n";
import { testContainer } from "@/testing";

import DatePicker from "./DatePicker.vue";

import type { Picking } from "./errors";
import type { DatePickerModalProps } from "./modals";

interface MountProps {
  picking: Picking;
  bounds?: OpenInterval;
  placeholder?: string;
  disabled?: boolean;
  modelValue?: Period | null;
}

async function mount(props: MountProps) {
  const harness = await testContainer();
  return { harness, ...harness.render(DatePicker, { props }) };
}

describe("DatePicker", () => {
  describe("label", () => {
    it("shows the placeholder when modelValue is null and no placeholder is provided", async () => {
      await mount({ picking: "day", modelValue: null });
      expect(screen.getByRole("button").textContent?.trim()).toBe(m.common_pick_a_date());
    });

    it("shows the explicit placeholder when modelValue is null and a placeholder is provided", async () => {
      await mount({ picking: "day", modelValue: null, placeholder: "Choose a day" });
      expect(screen.getByRole("button").textContent?.trim()).toBe("Choose a day");
    });

    it("shows the formatted period label when modelValue is a DayPeriod", async () => {
      await mount({ picking: "day", modelValue: DayPeriod.containing(date("2025-03-15")) });
      expect(screen.getByRole("button").textContent?.trim()).toBe("2025-03-15");
    });
  });

  describe("modal opening", () => {
    it("opens the modal when the button is clicked", async () => {
      const { harness } = await mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      expect(harness.modals.opens.length).toBe(1);
    });

    it("passes picking to the modal props", async () => {
      const { harness } = await mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      expect(harness.modals.lastOpen<DatePickerModalProps, Period>().props.picking).toBe("day");
    });

    it("does not open the modal when disabled", async () => {
      const { harness } = await mount({ picking: "day", modelValue: null, disabled: true });
      await userEvent.click(screen.getByRole("button"));
      expect(harness.modals.opens.length).toBe(0);
    });
  });

  describe("modelValue updates", () => {
    it("emits update:modelValue with the submitted period when the modal resolves", async () => {
      const { harness, emitted } = await mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      const period = DayPeriod.containing(date("2025-03-15"));
      harness.modals.lastOpen<unknown, typeof period>().submit(period);
      await vi.waitFor(() => {
        expect(emitted("update:modelValue")).toBeDefined();
      });
      const [[emittedPeriod]] = emitted("update:modelValue") as [[DayPeriod]];
      expect(emittedPeriod.anchor.toAnchor()).toBe("2025-03-15");
    });

    it("does not emit update:modelValue when the modal is cancelled", async () => {
      const { harness, emitted } = await mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      harness.modals.lastOpen().cancel();
      await Promise.resolve();
      await Promise.resolve();
      expect(emitted("update:modelValue")).toBeUndefined();
    });
  });
});
