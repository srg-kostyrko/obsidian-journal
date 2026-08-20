import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar, WeekPresetApplierToken } from "@/calendar";
import { m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { AsyncResult } from "@/infrastructure/result";
import { ReloadHintService } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { calendarDisplaySlice } from "../display-slice";
import { calendarSlice } from "../slice";

import CalendarWeekBlock from "./CalendarWeekBlock.vue";
import { weekPresetPickerModal } from "./modals";

import type { CalendarSliceState } from "../slice";

function setupContainer(initial?: CalendarSliceState) {
  const raw = initial ? { version: 5, calendar: initial } : undefined;
  const settings = createSettingsService({ slices: [calendarSlice, calendarDisplaySlice], raw });
  const container = settings.container;

  const modalService = {
    open: vi.fn(),
  } as unknown as ModalService;
  container.register(ModalService).useValue(modalService);
  container.register(Calendar).useValue(new Calendar());
  container.register(ReloadHintService).useClass(ReloadHintService);
  // Mirrors WeekPresetService.apply: the real applier writes the slice synchronously before
  // it awaits the re-anchor, so reload-hint tests stay sensitive to call order against a
  // stub that does the same.
  const applier = {
    apply: vi.fn((next: CalendarSliceState) => {
      settings.service.getSlice(calendarSlice).state = next;
      return AsyncResult.ok();
    }),
  };
  container.register(WeekPresetApplierToken).useValue(applier);

  return {
    container,
    settings: settings.service,
    modalService,
    reloadHint: container.resolve(ReloadHintService),
    applier,
  };
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

// The section holds several toggles, so each one is reached through the row that names it.
function toggleInRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest(".setting-item");
  if (!row) throw new Error(`no setting row named ${name}`);
  return within(row as HTMLElement).getByRole("checkbox");
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
    await userEvent.click(toggleInRow(m.calendar_apply_globally_title()));
    const state = settings.getSlice(calendarSlice).state;
    expect(state).toEqual({ mode: "custom", dow: 1, doy: 4, global: true });
  });

  it("writes timelineNavigation to the display slice when its toggle is flipped", async () => {
    const { container, settings } = setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    await settings.initialize();
    mount(container);
    await openSection();

    await userEvent.click(toggleInRow(m.calendar_timeline_navigation_label()));

    expect(settings.getSlice(calendarDisplaySlice).state.timelineNavigation).toBe(true);
  });

  it("requests a reload when the apply-globally toggle is flipped", async () => {
    const { container, settings, reloadHint } = setupContainer({ mode: "custom", dow: 1, doy: 4, global: false });
    await settings.initialize();
    mount(container);
    await openSection();
    await userEvent.click(toggleInRow(m.calendar_apply_globally_title()));
    expect(reloadHint.pending.value).toBe(true);
  });

  it("does not request a reload for a preset change that never touches the global patch", async () => {
    const { container, settings, modalService, reloadHint } = setupContainer();
    await settings.initialize();
    (modalService.open as ReturnType<typeof vi.fn>).mockReturnValue(
      AsyncResult.ok<CalendarSliceState>({ mode: "custom", dow: 0, doy: 6, global: false }),
    );
    mount(container);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    await Promise.resolve();
    expect(reloadHint.pending.value).toBe(false);
  });

  it("requests a reload when the picked preset turns the global patch on", async () => {
    const { container, settings, modalService, reloadHint } = setupContainer();
    await settings.initialize();
    (modalService.open as ReturnType<typeof vi.fn>).mockReturnValue(
      AsyncResult.ok<CalendarSliceState>({ mode: "custom", dow: 0, doy: 6, global: true }),
    );
    mount(container);
    await openSection();
    await userEvent.click(screen.getByText(m.calendar_week_config_change()));
    await Promise.resolve();
    expect(reloadHint.pending.value).toBe(true);
  });

  it("hands the picked preset to the applier", async () => {
    const { container, settings, modalService, applier } = setupContainer();
    await settings.initialize();
    vi.mocked(modalService.open).mockReturnValue(AsyncResult.ok({ mode: "custom", dow: 0, doy: 6, global: false }));
    mount(container);
    await openSection();

    await userEvent.click(screen.getByText(m.calendar_week_config_change()));

    expect(applier.apply).toHaveBeenCalledWith({ mode: "custom", dow: 0, doy: 6, global: false });
  });
});
