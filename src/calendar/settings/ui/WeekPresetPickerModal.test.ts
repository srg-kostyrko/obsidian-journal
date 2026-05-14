import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { ModalContextKey } from "@/infrastructure/host/modals/internal/modal-context";

import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";

import type { CalendarSliceState } from "../slice";

function mountModal(current: CalendarSliceState, api: ModalApi<CalendarSliceState>) {
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());

  return render(WeekPresetPickerModal, {
    props: { current },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            app.provide(ModalContextKey, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
}

function rowFor(name: string): HTMLElement {
  const heading = screen.getByText(name);
  const row = heading.closest(".setting-item");
  if (!row) throw new Error(`row for ${name} not found`);
  return row as HTMLElement;
}

afterEach(() => cleanup());

describe("WeekPresetPickerModal", () => {
  it("submits the ISO 8601 preset when its Use button is clicked then Update is pressed", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "locale" }, api);

    const useButton = rowFor(m.calendar_preset_name({ preset: "iso-8601" })).querySelector("button");
    await userEvent.click(useButton!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(api.submit).toHaveBeenCalledWith({ mode: "custom", dow: 1, doy: 4, global: false });
  });

  it('submits { mode: "locale" } when the locale row\'s Use button + Update are clicked', async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);

    const useButton = rowFor(m.calendar_preset_name({ preset: "locale" })).querySelector("button");
    await userEvent.click(useButton!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(api.submit).toHaveBeenCalledWith({ mode: "locale" });
  });

  it("switches into custom mode when the Custom row's Use button is clicked, even from a preset", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);

    const useButton = rowFor(m.calendar_preset_name({ preset: "custom" })).querySelector("button");
    await userEvent.click(useButton!);

    expect(screen.queryByText(m.calendar_picker_start_week_on())).not.toBeNull();
    expect(screen.queryByText(m.calendar_picker_first_week_label())).not.toBeNull();
  });

  it("submits the custom dow/doy when in custom mode with edited values", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);
    await userEvent.click(rowFor(m.calendar_preset_name({ preset: "custom" })).querySelector("button")!);

    const dropdown = rowFor(m.calendar_picker_start_week_on()).querySelector("select");
    await userEvent.selectOptions(dropdown!, "3");

    const numberInput = rowFor(m.calendar_picker_first_week_label()).querySelector("input");
    await userEvent.clear(numberInput!);
    await userEvent.type(numberInput!, "2");

    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));
    expect(api.submit).toHaveBeenCalledWith({ mode: "custom", dow: 3, doy: 8, global: false });
  });

  it("shows the Currently used marker on the saved row, not the staged row", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "custom", dow: 1, doy: 4, global: false }, api);

    const isoRow = rowFor(m.calendar_preset_name({ preset: "iso-8601" }));
    expect(isoRow.textContent).toContain(m.calendar_picker_in_use_marker());

    const westernRow = rowFor(m.calendar_preset_name({ preset: "western" }));
    await userEvent.click(westernRow.querySelector("button")!);
    expect(rowFor(m.calendar_preset_name({ preset: "iso-8601" })).textContent).toContain(
      m.calendar_picker_in_use_marker(),
    );
    expect(rowFor(m.calendar_preset_name({ preset: "western" })).textContent).not.toContain(
      m.calendar_picker_in_use_marker(),
    );
  });

  it("cancels via the api when the Cancel button is clicked", async () => {
    const api: ModalApi<CalendarSliceState> = { submit: vi.fn(), cancel: vi.fn() };
    mountModal({ mode: "locale" }, api);

    await userEvent.click(screen.getByText(m.calendar_picker_cancel_action()));
    expect(api.cancel).toHaveBeenCalled();
  });
});
