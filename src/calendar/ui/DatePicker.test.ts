import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Calendar, DayPeriod, type OpenInterval, type Period } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

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

function mount(props: MountProps) {
  const container = new Container();
  const fakeService = new FakeModalService();
  container.register(Calendar).useValue(testCalendar());
  container.register(ModalService).useValue(fakeService as unknown as ModalService);
  return {
    fakeService,
    ...render(DatePicker, {
      props,
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
            },
          },
        ],
      },
    }),
  };
}

describe("DatePicker", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  describe("label", () => {
    it("shows the placeholder when modelValue is null and no placeholder is provided", () => {
      mount({ picking: "day", modelValue: null });
      expect(screen.getByRole("button").textContent?.trim()).toBe(m.common_pick_a_date());
    });

    it("shows the explicit placeholder when modelValue is null and a placeholder is provided", () => {
      mount({ picking: "day", modelValue: null, placeholder: "Choose a day" });
      expect(screen.getByRole("button").textContent?.trim()).toBe("Choose a day");
    });

    it("shows the formatted period label when modelValue is a DayPeriod", () => {
      mount({ picking: "day", modelValue: DayPeriod.containing(date("2025-03-15")) });
      expect(screen.getByRole("button").textContent?.trim()).toBe("2025-03-15");
    });
  });

  describe("modal opening", () => {
    it("opens the modal when the button is clicked", async () => {
      const { fakeService } = mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      expect(fakeService.opens.length).toBe(1);
    });

    it("passes picking to the modal props", async () => {
      const { fakeService } = mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      expect(fakeService.lastOpen<DatePickerModalProps, Period>().props.picking).toBe("day");
    });

    it("does not open the modal when disabled", async () => {
      const { fakeService } = mount({ picking: "day", modelValue: null, disabled: true });
      await userEvent.click(screen.getByRole("button"));
      expect(fakeService.opens.length).toBe(0);
    });
  });

  describe("modelValue updates", () => {
    it("emits update:modelValue with the submitted period when the modal resolves", async () => {
      const { fakeService, emitted } = mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      const period = DayPeriod.containing(date("2025-03-15"));
      fakeService.lastOpen<unknown, typeof period>().submit(period);
      await vi.waitFor(() => {
        expect(emitted("update:modelValue")).toBeDefined();
      });
      const [[emittedPeriod]] = emitted("update:modelValue") as [[DayPeriod]];
      expect(emittedPeriod.anchor.toAnchor()).toBe("2025-03-15");
    });

    it("does not emit update:modelValue when the modal is cancelled", async () => {
      const { fakeService, emitted } = mount({ picking: "day", modelValue: null });
      await userEvent.click(screen.getByRole("button"));
      fakeService.lastOpen().cancel();
      await Promise.resolve();
      await Promise.resolve();
      expect(emitted("update:modelValue")).toBeUndefined();
    });
  });
});
