import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { calendarDisplaySlice } from "@/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { testCalendar } from "@/calendar/testing";
import { initLocale, m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { isFormat, PARTS, type FormatControl, type Width } from "../appearance-parts";
import { calendarAppearanceCoreModule } from "../module";

import AppearanceFormatControl from "./AppearanceFormatControl.vue";

function format(label: FormatControl["label"]): FormatControl {
  const found = Object.values(PARTS)
    .flatMap(({ controls }) => controls)
    .find((candidate): candidate is FormatControl => isFormat(candidate) && candidate.label === label);
  if (!found) throw new Error(`no format control for ${label}`);
  return found;
}

const box = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("textbox");
const suggestions = (): HTMLSelectElement =>
  screen.getByRole<HTMLSelectElement>("combobox", { name: m.calendar_appearance_format_suggestions() });
const optionTexts = (): string[] => [...suggestions().options].slice(1).map((option) => option.textContent.trim());
const preview = (): string =>
  screen.getByText(m.calendar_appearance_format_preview(), { exact: false }).textContent.trim();

async function pick(text: string): Promise<void> {
  const option = [...suggestions().options].find((candidate) => candidate.textContent.trim().startsWith(text));
  if (!option) throw new Error(`no suggestion ${text}`);
  await userEvent.selectOptions(suggestions(), option);
}

async function type(text: string): Promise<void> {
  await userEvent.clear(box());
  if (text !== "") await userEvent.type(box(), text.replaceAll("[", "[["));
}

beforeAll(() => initLocale("en"));

describe("AppearanceFormatControl", () => {
  let harness: TestHarness;
  const display = () => harness.settings.getSlice(calendarDisplaySlice);
  const mount = (label: FormatControl["label"], width: Width = "wide") =>
    harness.render(AppearanceFormatControl, { props: { control: format(label), width } });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // A Monday, 4 May 2026: every sample below is read from it.
    vi.setSystemTime(new Date(2026, 4, 4, 12, 0, 0));
    harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarSettingsCoreModule] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a row with a text box, a suggestions dropdown and a preview of the default", () => {
    const { container } = mount("day");

    expect(container.querySelector(".appearance-control")).not.toBeNull();
    expect(container.querySelector(".setting-item-name")?.textContent.trim()).toBe(
      m.calendar_appearance_control({ control: "label_day" }),
    );
    expect(box().value).toBe("");
    expect(box().placeholder).toBe("D");
    expect(suggestions()).toBeTruthy();
    expect(preview()).toBe(`${m.calendar_appearance_format_preview()} 4`);
    expect(screen.getByRole("link", { name: m.common_moment_format_reference() })).toBeTruthy();
  });

  it("writes a typed pattern and previews it on today", async () => {
    mount("day");

    await type("DD");

    expect(display().state.labels.day).toBe("DD");
    expect(box().value).toBe("DD");
    expect(preview()).toBe(`${m.calendar_appearance_format_preview()} 04`);
  });

  it("fills the box and writes the pattern of a picked suggestion", async () => {
    mount("day");

    await pick("Do");

    expect(display().state.labels.day).toBe("Do");
    expect(box().value).toBe("Do");
    expect(preview()).toBe(`${m.calendar_appearance_format_preview()} 4th`);
  });

  it("labels each suggestion with its pattern and a sample", () => {
    mount("day");

    expect(optionTexts()).toEqual(["D — 4", "DD — 04", "Do — 4th"]);
  });

  it("stores the default pattern as empty and shows it as the placeholder", async () => {
    mount("day");
    await pick("DD");

    await pick("D —");

    expect(display().state.labels.day).toBe("");
    expect(box().value).toBe("");
    expect(box().placeholder).toBe("D");
  });

  it("keeps a typed default in the box, so typing on from it is not swallowed", async () => {
    mount("day");

    await type("D");
    expect(display().state.labels.day).toBe("");
    expect(box().value).toBe("D");

    await userEvent.type(box(), "D");
    expect(display().state.labels.day).toBe("DD");
    expect(box().value).toBe("DD");
  });

  it("writes an empty box as the default and previews the default's output", async () => {
    display().state = { ...display().state, labels: { ...display().state.labels, day: "DD" } };
    mount("day");
    expect(box().value).toBe("DD");

    await type("");

    expect(display().state.labels.day).toBe("");
    expect(preview()).toBe(`${m.calendar_appearance_format_preview()} 4`);
  });

  it("follows a write from elsewhere, such as Reset", async () => {
    mount("day");
    await type("Do");

    display().state = { ...display().state, labels: { ...display().state.labels, day: "" } };
    await nextTick();

    expect(box().value).toBe("");
  });

  describe("the weekday", () => {
    it("offers One letter, which writes one letter and empties the box", async () => {
      mount("weekday");
      expect(optionTexts()).toEqual([
        "ddd — Mon",
        "dd — Mo",
        "dddd — Monday",
        `${m.calendar_appearance_format_letter()} — M`,
      ]);

      await pick(m.calendar_appearance_format_letter());

      expect(display().state.weekdayLabel).toEqual({ type: "letter" });
      expect(box().value).toBe("");
      expect(box().placeholder).toBe(m.calendar_appearance_format_letter());
      expect(preview()).toBe(`${m.calendar_appearance_format_preview()} M`);
    });

    it("writes a pattern again when typed into after one letter", async () => {
      display().state = { ...display().state, weekdayLabel: { type: "letter" } };
      mount("weekday");

      await type("dd");

      expect(display().state.weekdayLabel).toEqual({ type: "pattern", pattern: "dd" });
    });

    it("writes the typed word letter as a pattern", async () => {
      mount("weekday");

      await type("letter");

      expect(display().state.weekdayLabel).toEqual({ type: "pattern", pattern: "letter" });
    });

    it("does not offer Same as wide at wide", () => {
      mount("weekday");
      expect(optionTexts()).not.toContain(m.calendar_appearance_format_same_as_wide());
    });

    it("at narrow offers Same as wide and shows the wide label until set", async () => {
      display().state = { ...display().state, weekdayLabel: { type: "pattern", pattern: "dddd" } };
      mount("weekday", "narrow");
      expect(optionTexts()).toContain(m.calendar_appearance_format_same_as_wide());
      expect(box().placeholder).toBe(m.calendar_appearance_format_same_as_wide());
      expect(preview()).toBe(`${m.calendar_appearance_format_preview()} Monday`);

      await pick(m.calendar_appearance_format_letter());
      expect(display().state.weekdayLabelNarrow).toEqual({ type: "letter" });
      expect(display().state.weekdayLabel).toEqual({ type: "pattern", pattern: "dddd" });

      await pick(m.calendar_appearance_format_same_as_wide());
      expect(display().state.weekdayLabelNarrow).toBeNull();
    });

    it("has no All widths note, since it has a value per width", () => {
      mount("weekday");

      expect(screen.queryByText(m.calendar_appearance_all_widths())).toBeNull();
    });
  });

  it.each(["day", "week", "month", "quarter", "year"] as const)("notes the %s format holds for all widths", (label) => {
    mount(label, "narrow");

    expect(screen.getByText(m.calendar_appearance_all_widths())).toBeTruthy();
  });

  describe("the ISO week warning", () => {
    it("shows for W when the week grid is not ISO, and follows the grid", async () => {
      testCalendar().applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });
      mount("week");

      await type("[W]W");

      expect(display().state.labels.week).toBe("[W]W");
      expect(screen.getByText(m.journal_edit_wrong_week_warning())).toBeTruthy();

      testCalendar().applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: false });
      await nextTick();
      expect(screen.queryByText(m.journal_edit_wrong_week_warning())).toBeNull();
    });

    it("does not show for W on an ISO grid", async () => {
      testCalendar().applyWeekConfig({ dow: 1, doy: 4 }, { propagateToGlobal: false });
      mount("week");

      await type("[W]W");

      expect(screen.queryByText(m.journal_edit_wrong_week_warning())).toBeNull();
    });

    it("does not show for the week-grid w", async () => {
      testCalendar().applyWeekConfig({ dow: 0, doy: 6 }, { propagateToGlobal: false });
      mount("week");

      await type("[W]w");

      expect(screen.queryByText(m.journal_edit_wrong_week_warning())).toBeNull();
    });
  });
});
