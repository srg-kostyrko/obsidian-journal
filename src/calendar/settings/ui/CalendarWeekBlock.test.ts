import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult } from "@/infrastructure/result";
import { createSettingsService } from "@/settings/testing";

import { calendarDisplaySlice } from "../display-slice";
import { calendarSlice } from "../slice";

import CalendarWeekBlock from "./CalendarWeekBlock.vue";
import { weekPresetPickerModal } from "./modals";

import type { CalendarSliceState } from "../slice";

function setupContainer(initial?: CalendarSliceState) {
  const raw = initial ? { version: 4, calendar: initial } : undefined;
  const settings = createSettingsService({ slices: [calendarSlice, calendarDisplaySlice], raw });
  const container = settings.container;

  const modalService = {
    open: vi.fn(),
  } as unknown as ModalService;
  container.register(ModalService).useValue(modalService);
  container.register(Calendar).useValue(new Calendar());

  return { container, settings: settings.service, modalService };
}

function mount(container: Container) {
  return render(CalendarWeekBlock, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

async function openSection(): Promise<void> {
  await userEvent.click(screen.getByText(m.common_label_calendar()));
}

afterEach(() => cleanup());

describe("CalendarWeekBlock", () => {
  it("starts collapsed and hides the inner settings", async () => {
    const { container, settings } = setupContainer();
    await settings.initialize();
    mount(container);
    expect(screen.queryByText(m.calendar_week_config_change())).toBeNull();
  });

  it("renders the Change button once expanded", async () => {
    const { container, settings } = setupContainer();
    await settings.initialize();
    mount(container);
    await openSection();
    expect(screen.getByText(m.calendar_week_config_change())).toBeTruthy();
  });

  it("hides the global toggle when mode is locale", async () => {
    const { container, settings } = setupContainer({ mode: "locale" });
    await settings.initialize();
    mount(container);
    await openSection();
    expect(screen.queryByText(m.calendar_apply_globally_title())).toBeNull();
  });

  it("shows the global toggle when mode is custom", async () => {
    const { container, settings } = setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    await settings.initialize();
    mount(container);
    await openSection();
    expect(screen.getByText(m.calendar_apply_globally_title())).toBeTruthy();
  });

  it("opens the modal when Change is clicked", async () => {
    const { container, settings, modalService } = setupContainer();
    await settings.initialize();
    const pending = new Promise<CalendarSliceState>(() => undefined);
    (modalService.open as ReturnType<typeof vi.fn>).mockReturnValue(
      AsyncResult.fromPromise(pending, () => new Error("never")),
    );
    mount(container);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    expect(modalService.open).toHaveBeenCalledWith(weekPresetPickerModal, { current: { mode: "locale" } });
  });

  it("shows the active preset name in the description", async () => {
    const { container, settings } = setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    await settings.initialize();
    mount(container);
    await openSection();
    expect(screen.getByText(m.calendar_preset_name({ preset: "iso-8601" }))).toBeTruthy();
  });

  it("shows a dynamic summary when the current week settings do not match a named preset", async () => {
    const { container, settings } = setupContainer({ mode: "custom", dow: 3, doy: 7, global: false });
    await settings.initialize();
    mount(container);
    await openSection();
    expect(screen.getByText(m.calendar_preset_name({ preset: "custom" }))).toBeTruthy();
    expect(screen.getByText(/Wednesday/)).toBeTruthy();
    expect(screen.getByText(/Jan 3\b/)).toBeTruthy();
  });

  it("flips slice.state.global when the apply-globally toggle is clicked", async () => {
    const { container, settings } = setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    await settings.initialize();
    mount(container);
    await openSection();
    const toggle = screen.getByRole("checkbox");
    await userEvent.click(toggle);
    const state = settings.getSlice(calendarSlice).state;
    expect(state).toEqual({ mode: "custom", dow: 1, doy: 4, global: true });
  });

  it("updates the slice state when the modal resolves Ok", async () => {
    const { container, settings, modalService } = setupContainer();
    await settings.initialize();
    (modalService.open as ReturnType<typeof vi.fn>).mockReturnValue(
      AsyncResult.ok<CalendarSliceState>({ mode: "custom", dow: 0, doy: 6, global: false }),
    );
    mount(container);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    await Promise.resolve();
    expect(settings.getSlice(calendarSlice).state).toEqual({
      mode: "custom",
      dow: 0,
      doy: 6,
      global: false,
    });
  });
});
