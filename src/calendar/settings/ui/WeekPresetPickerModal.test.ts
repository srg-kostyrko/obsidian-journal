import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { testContainer } from "@/testing";

import WeekPresetPickerModal from "./WeekPresetPickerModal.vue";

import type { CalendarSliceState } from "../slice";

async function resolveModal(current: CalendarSliceState, localeWeek?: { dow: number; doy: number }) {
  const harness = await testContainer();
  vi.spyOn(harness.resolve(Calendar), "localeWeek").mockReturnValue(localeWeek ?? { dow: 1, doy: 4 });
  return harness.renderModal<typeof WeekPresetPickerModal, CalendarSliceState>(WeekPresetPickerModal, {
    props: { current },
  });
}

function rowFor(name: string): HTMLElement {
  const heading = screen.getByText(name);
  const row = heading.closest(".setting-item");
  if (!row) throw new Error(`row for ${name} not found`);
  return row as HTMLElement;
}

describe("WeekPresetPickerModal", () => {
  it("submits the ISO 8601 preset when its Use button is clicked then Update is pressed", async () => {
    const { submit } = await resolveModal({ mode: "locale" });

    const useButton = rowFor(m.calendar_preset_name({ preset: "iso-8601" })).querySelector("button");
    await userEvent.click(useButton!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(submit).toHaveBeenCalledWith({ mode: "custom", dow: 1, doy: 4, global: false });
  });

  it('submits { mode: "locale" } when the locale row\'s Use button + Update are clicked', async () => {
    const { submit } = await resolveModal({ mode: "custom", dow: 1, doy: 4, global: false });

    const useButton = rowFor(m.calendar_preset_name({ preset: "locale" })).querySelector("button");
    await userEvent.click(useButton!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(submit).toHaveBeenCalledWith({ mode: "locale" });
  });

  it("switches into custom mode when the Custom row's Use button is clicked, even from a preset", async () => {
    await resolveModal({ mode: "custom", dow: 1, doy: 4, global: false });

    const useButton = rowFor(m.calendar_preset_name({ preset: "custom" })).querySelector("button");
    await userEvent.click(useButton!);

    expect(screen.queryByText(m.calendar_picker_start_week_on())).not.toBeNull();
    expect(screen.queryByText(m.calendar_picker_first_week_label())).not.toBeNull();
  });

  it("prefills the custom fields from the locale week when Custom is opened from locale mode", async () => {
    const { submit } = await resolveModal({ mode: "locale" }, { dow: 0, doy: 6 });

    await userEvent.click(rowFor(m.calendar_preset_name({ preset: "custom" })).querySelector("button")!);
    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));

    expect(submit).toHaveBeenCalledWith({ mode: "custom", dow: 0, doy: 6, global: false });
  });

  it("submits the custom dow/doy when in custom mode with edited values", async () => {
    const { submit } = await resolveModal({ mode: "custom", dow: 1, doy: 4, global: false });
    await userEvent.click(rowFor(m.calendar_preset_name({ preset: "custom" })).querySelector("button")!);

    const dropdown = rowFor(m.calendar_picker_start_week_on()).querySelector("select");
    await userEvent.selectOptions(dropdown!, "3");

    const numberInput = rowFor(m.calendar_picker_first_week_label()).querySelector("input");
    await userEvent.clear(numberInput!);
    await userEvent.type(numberInput!, "2");

    await userEvent.click(screen.getByText(m.calendar_picker_update_action()));
    expect(submit).toHaveBeenCalledWith({ mode: "custom", dow: 3, doy: 8, global: false });
  });

  it("shows the Currently used marker on the saved row, not the staged row", async () => {
    await resolveModal({ mode: "custom", dow: 1, doy: 4, global: false });

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
    const { cancel } = await resolveModal({ mode: "locale" });

    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalled();
  });
});
