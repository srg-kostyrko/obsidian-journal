import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { CalendarDate, calendarDisplaySlice } from "@/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { date } from "@/calendar/testing";
import { initLocale, m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { withValue } from "../appearance-editing";
import { calendarAppearanceCoreModule } from "../module";
import { appearanceSlice } from "../slice";

import AppearanceSubpage from "./AppearanceSubpage.vue";

import type { PartKey } from "../appearance-parts";

const partName = (part: PartKey): string => m.calendar_appearance_part({ part });

function partsList(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: m.calendar_appearance_part_label() });
}

function chips(): HTMLElement[] {
  const group = screen.queryByRole("group", { name: m.calendar_appearance_also_here() });
  return group ? within(group).getAllByRole("button") : [];
}

function inspectorHeading(container: Element): HTMLElement {
  const heading = container.querySelector<HTMLElement>(".appearance-subpage__inspector");
  if (!heading) throw new Error("no inspector heading");
  return heading;
}

const summary = (): HTMLElement | null =>
  screen.queryByText(m.calendar_appearance_weekend_summary({ mode: "some", days: "Saturday and Sunday" }));

function partOption(part: PartKey): HTMLOptionElement {
  return within(partsList()).getByRole<HTMLOptionElement>("option", { name: new RegExp(`^${partName(part)}`) });
}

function todayCell(container: Element): HTMLElement {
  const cell = container.querySelector<HTMLElement>('[data-preview-part="date"][data-anchor="2026-05-13"]');
  if (!cell) throw new Error("no preview cell for today");
  return cell;
}

function openNoteCell(container: Element): HTMLElement {
  const cell = container.querySelector<HTMLElement>('[data-preview-part="date"][data-anchor="2026-05-15"]');
  if (!cell) throw new Error("no preview cell for the open note");
  return cell;
}

function selectedCell(container: Element): HTMLElement {
  const cell = container.querySelector<HTMLElement>('[data-preview-part="date"][data-selected]');
  if (!cell) throw new Error("no preview cell for the selected day");
  return cell;
}

function outlined(container: Element): Element[] {
  return [...container.querySelectorAll(".appearance-preview__picked")];
}

function days(container: Element): Element[] {
  return [...container.querySelectorAll('[data-preview-part="date"]')];
}

function plainDay(container: Element): HTMLElement {
  const cell = container.querySelector<HTMLElement>('[data-preview-part="date"][data-anchor="2026-05-20"]');
  if (!cell) throw new Error("no preview cell for 2026-05-20");
  return cell;
}

function italicSelect(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", {
    name: m.calendar_appearance_control({ control: "text_italic" }),
  });
}

function italicDefault(option: "on" | "off"): string {
  return m.calendar_appearance_default_resolved({
    value: m.calendar_appearance_option({ option: `italic_${option}` }),
  });
}

function familyButton(family: "visibility" | "text"): HTMLElement {
  return screen.getByRole("button", { name: m.calendar_appearance_family({ family }) });
}

async function switchTo(width: "wide" | "narrow"): Promise<void> {
  await userEvent.click(screen.getByRole("radio", { name: m.calendar_appearance_width({ width }) }));
}

beforeAll(() => initLocale("en"));

describe("AppearanceSubpage", () => {
  let harness: TestHarness;
  const slice = () => harness.settings.getSlice(appearanceSlice);
  const display = () => harness.settings.getSlice(calendarDisplaySlice);
  let nav: { back: Mock; push: Mock; replace: Mock };
  const mount = () => harness.render(AppearanceSubpage, { props: { nav } });

  beforeEach(async () => {
    nav = { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
    vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-05-13"));
    harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarSettingsCoreModule] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("goes back through the back link", async () => {
    mount();

    await userEvent.click(screen.getByText(m.common_label_back()));

    expect(nav.back).toHaveBeenCalledOnce();
  });

  it("the width switch sits in the preview panel's header", () => {
    const { container } = mount();
    const header = container.querySelector<HTMLElement>(".appearance-subpage__panel-head");
    if (!header) throw new Error("no preview panel header");

    expect(within(header).getByText(m.calendar_appearance_preview())).toBeTruthy();
    expect(within(header).getByRole("radiogroup", { name: m.calendar_appearance_width_label() })).toBeTruthy();
  });

  it("a pick on today edits Today, with Date number and Cells also here", async () => {
    const { container } = mount();

    await userEvent.click(todayCell(container));

    expect(partsList().value).toBe("today");
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual(
      (["currentWeek", "date", "cell", "grid"] as const).map(partName),
    );
    expect(screen.getByText("--journal-cell-today-text-color")).toBeTruthy();
  });

  it("a preview pick edits the first part and lists the others as also here", async () => {
    const { container } = mount();

    await userEvent.click(selectedCell(container));

    expect(partsList().value).toBe("selected");
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual(
      (["currentWeek", "weekend", "date", "cell", "grid"] as const).map(partName),
    );

    await userEvent.click(chips()[2]);

    expect(partsList().value).toBe("date");
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual(
      (["selected", "currentWeek", "weekend", "cell", "grid"] as const).map(partName),
    );
  });

  it("a pick on the open note's day edits Open note, with Date number and Cells also here", async () => {
    const { container } = mount();

    await userEvent.click(openNoteCell(container));

    expect(partsList().value).toBe("active");
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual(
      (["currentWeek", "date", "cell", "grid"] as const).map(partName),
    );
  });

  it.each(["{Enter}", " "])("moves focus to the parts list once %j picks an also-here part", async (key) => {
    const { container } = mount();
    await userEvent.click(selectedCell(container));

    chips()[2].focus();
    await userEvent.keyboard(key);

    expect(partsList().value).toBe("date");
    expect(document.activeElement).toBe(partsList());
  });

  it("hides also here when the spot holds only the edited part", async () => {
    const { container } = mount();
    const grid = container.querySelector<HTMLElement>(".appearance-preview__grid");
    if (!grid) throw new Error("no grid in the preview");

    await userEvent.click(grid);

    expect(partsList().value).toBe("grid");
    expect(screen.queryByRole("group", { name: m.calendar_appearance_also_here() })).toBeNull();
  });

  it("outlines the edited part in the preview", async () => {
    const { container } = mount();

    await userEvent.click(todayCell(container));
    expect(outlined(container)).toEqual([todayCell(container)]);

    await userEvent.selectOptions(partsList(), "weekNumber");
    expect(outlined(container)).toEqual([
      ...container.querySelectorAll(".notes-calendar-divider, .appearance-preview__week-number"),
    ]);
  });

  describe("a part every day has", () => {
    it("outlines every day when chosen from the list after a click", async () => {
      const { container } = mount();
      await userEvent.click(plainDay(container));
      expect(outlined(container)).toEqual([plainDay(container)]);

      await userEvent.selectOptions(partsList(), "cell");

      expect(outlined(container)).toEqual(days(container));
    });

    it("keeps the clicked day when chosen from also here", async () => {
      const { container } = mount();
      await userEvent.click(plainDay(container));

      await userEvent.click(
        within(screen.getByRole("group", { name: m.calendar_appearance_also_here() })).getByRole("button", {
          name: partName("cell"),
        }),
      );

      expect(partsList().value).toBe("cell");
      expect(outlined(container)).toEqual([plainDay(container)]);
    });
  });

  it("heads the controls with the part's name and the width they apply to, Reset beside them", async () => {
    const { container } = mount();
    await userEvent.selectOptions(partsList(), "date");

    const heading = () => inspectorHeading(container);
    expect(within(heading()).getByText(partName("date"))).toBeTruthy();
    expect(within(heading()).getByText(m.calendar_appearance_scope({ width: "wide" }))).toBeTruthy();
    expect(
      within(heading()).getByRole("button", { name: m.calendar_appearance_reset({ width: "wide" }) }),
    ).toBeTruthy();

    await switchTo("narrow");

    expect(within(heading()).getByText(m.calendar_appearance_scope({ width: "narrow" }))).toBeTruthy();
    expect(
      within(heading()).getByRole("button", { name: m.calendar_appearance_reset({ width: "narrow" }) }),
    ).toBeTruthy();
  });

  it("groups the controls under a family section that starts open and collapses", async () => {
    mount();
    await userEvent.selectOptions(partsList(), "date");

    const family = screen.getByRole("button", { name: m.calendar_appearance_family({ family: "text" }) });
    expect(family.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("--journal-cell-date-size")).toBeTruthy();

    await userEvent.click(family);

    expect(family.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("--journal-cell-date-size")).toBeNull();

    await userEvent.selectOptions(partsList(), "heading");
    expect(
      screen
        .getByRole("button", { name: m.calendar_appearance_family({ family: "text" }) })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  describe("one section per family", () => {
    it("shows Visibility, Label, then Text for the weekday header", async () => {
      const { container } = mount();
      await userEvent.selectOptions(partsList(), "weekday");

      const triggers = [...container.querySelectorAll(".appearance-subpage__family .collapsible-trigger-text")];
      expect(triggers.map((trigger) => trigger.textContent?.trim())).toEqual(
        (["visibility", "label", "text"] as const).map((family) => m.calendar_appearance_family({ family })),
      );
      expect(
        screen.getByRole("combobox", { name: m.calendar_appearance_control({ control: "visibility_show_weekdays" }) }),
      ).toBeTruthy();
      expect(
        screen.getByRole("textbox", { name: m.calendar_appearance_control({ control: "label_weekday" }) }),
      ).toBeTruthy();
    });

    it("lists the heading's month, quarter and year formats under Label", async () => {
      mount();
      await userEvent.selectOptions(partsList(), "heading");

      const names = screen.getAllByRole("textbox").map((box) => box.getAttribute("aria-label"));
      expect(names).toEqual(
        (["label_month", "label_quarter", "label_year"] as const).map((control) =>
          m.calendar_appearance_control({ control }),
        ),
      );
    });

    it("collapsing Visibility on one part leaves it open on the next", async () => {
      mount();
      await userEvent.selectOptions(partsList(), "weekday");

      await userEvent.click(familyButton("visibility"));
      expect(familyButton("visibility").getAttribute("aria-expanded")).toBe("false");
      expect(familyButton("text").getAttribute("aria-expanded")).toBe("true");

      await userEvent.selectOptions(partsList(), "heading");

      expect(familyButton("visibility").getAttribute("aria-expanded")).toBe("true");
    });
  });

  it("Reset at Wide on Month grid restores its rows", async () => {
    display().state = { ...display().state, monthRows: "six" };
    mount();
    await userEvent.selectOptions(partsList(), "grid");
    expect(partOption("grid").textContent).toContain("•");

    await userEvent.click(screen.getByRole("button", { name: m.calendar_appearance_reset({ width: "wide" }) }));

    expect(display().state.monthRows).toBe("fit");
  });

  it("the preview follows the visibility settings", async () => {
    const { container } = mount();
    expect(container.querySelector('.appearance-preview [data-preview-part="heading"]')).not.toBeNull();

    display().state = { ...display().state, showHeading: false };

    await vi.waitFor(() =>
      expect(container.querySelector('.appearance-preview [data-preview-part="heading"]')).toBeNull(),
    );
  });

  it("a click in the preview grid offers Month grid last", async () => {
    const { container } = mount();

    await userEvent.click(plainDay(container));

    expect(chips().map((chip) => chip.textContent?.trim())).toEqual((["cell", "grid"] as const).map(partName));
  });

  it("the parts list reaches every part", async () => {
    mount();

    const offered = [...partsList().options].filter((option) => option.value !== "");
    expect(offered).toHaveLength(12);
    expect(offered.at(-1)?.value).toBe("grid");

    await userEvent.selectOptions(partsList(), "weekday");

    expect(screen.getByText("--journal-cell-weekday-size")).toBeTruthy();
    expect(chips()).toEqual([]);
  });

  it.each([
    ["weekend", "Weekends"],
    ["currentWeek", "Current week"],
  ] as const)("the parts list names %s", (part, name) => {
    mount();

    expect(partOption(part).textContent?.trim()).toBe(name);
  });

  it("shows the weekend summary under Weekends alone", async () => {
    mount();

    await userEvent.selectOptions(partsList(), "weekend");
    expect(summary()).toBeTruthy();

    await userEvent.selectOptions(partsList(), "currentWeek");
    expect(summary()).toBeNull();
  });

  it("says how to pick a part beside the preview's title, captions the width, and shows no controls until one is", () => {
    const { container } = mount();

    const head = container.querySelector(".appearance-subpage__panel-head");
    expect(head?.textContent).toContain(m.calendar_appearance_part_hint());
    const caption = container.querySelector(".appearance-subpage__caption");
    expect(caption?.textContent?.trim()).toBe(m.calendar_appearance_editing({ width: "wide" }));
    expect(screen.queryByText(/--journal-cell-/)).toBeNull();
    expect(container.querySelector(".appearance-subpage__inspector")).toBeNull();
  });

  it("hides the controls the chosen style does not use", async () => {
    mount();
    await userEvent.selectOptions(partsList(), "today");
    expect(screen.queryByText("--journal-cell-today-ring-width")).toBeNull();

    slice().state = withValue(slice().state, "wide", "today", ["style"], "ring");

    expect(await screen.findByText("--journal-cell-today-ring-width")).toBeTruthy();
  });

  it("shows the divider's color and width only while the divider is shown, at the width edited", async () => {
    mount();
    await userEvent.selectOptions(partsList(), "weekNumber");
    expect(screen.getByText("--journal-cell-week-number-divider-width")).toBeTruthy();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: m.calendar_appearance_control({ control: "divider_divider" }) }),
      "hidden",
    );

    expect(slice().state.wide.weekNumber.divider).toBe(false);
    expect(screen.queryByText("--journal-cell-week-number-divider-width")).toBeNull();
    expect(screen.queryByText("--journal-cell-week-number-divider-color")).toBeNull();
    await switchTo("narrow");
    expect(screen.queryByText("--journal-cell-week-number-divider-width-narrow")).toBeNull();
    slice().state = withValue(slice().state, "narrow", "weekNumber", ["divider"], true);
    expect(await screen.findByText("--journal-cell-week-number-divider-width-narrow")).toBeTruthy();
  });

  it("a modified part carries the marker in the chips and the parts list, per width", async () => {
    const { container } = mount();
    slice().state = withValue(slice().state, "wide", "selected", ["ringWidth"], 3);
    await userEvent.click(selectedCell(container));
    await userEvent.click(chips()[0]);

    const selectedChip = () => chips()[0];
    const modified = m.calendar_appearance_modified();
    expect(partOption("selected").textContent).toContain("•");
    expect(partOption("selected").getAttribute("aria-label")).toContain(modified);
    expect(selectedChip().classList.contains("is-modified")).toBe(true);
    expect(within(selectedChip()).getByText(modified)).toBeTruthy();
    expect(chips()[1].textContent).not.toContain(modified);

    await switchTo("narrow");

    expect(partOption("selected").textContent).not.toContain("•");
    expect(partOption("selected").getAttribute("aria-label")).toBeNull();
    expect(selectedChip().classList.contains("is-modified")).toBe(false);
    expect(selectedChip().textContent).not.toContain(modified);
  });

  it("Reset at Narrow clears only narrow", async () => {
    let state = withValue(slice().state, "wide", "cell", ["padding"], 5);
    state = withValue(state, "narrow", "cell", ["padding"], 2);
    slice().state = state;
    mount();
    await userEvent.selectOptions(partsList(), "cell");
    await switchTo("narrow");

    await userEvent.click(screen.getByRole("button", { name: m.calendar_appearance_reset({ width: "narrow" }) }));

    expect(slice().state.narrow.cell.padding).toBeNull();
    expect(slice().state.wide.cell.padding).toBe(5);
  });

  it("Reset at Wide restores the stock and keeps narrow", async () => {
    let state = withValue(slice().state, "wide", "cell", ["radius"], "4px");
    state = withValue(state, "narrow", "cell", ["padding"], 2);
    slice().state = state;
    mount();
    await userEvent.selectOptions(partsList(), "cell");

    await userEvent.click(screen.getByRole("button", { name: m.calendar_appearance_reset({ width: "wide" }) }));

    expect(slice().state.wide.cell.radius).toBe("var(--radius-s)");
    expect(slice().state.narrow.cell.padding).toBe(2);
  });

  it("the width switch drives the preview and the edited width", async () => {
    const { container } = mount();
    const preview = () => container.querySelector<HTMLElement>(".appearance-preview");
    expect(preview()?.style.width).toBe("100%");
    await userEvent.selectOptions(partsList(), "cell");

    await switchTo("narrow");

    expect(preview()?.style.width).toBe("260px");
    expect(screen.getByText("--journal-cell-cell-padding-narrow")).toBeTruthy();
  });

  it("names an inherited Default from the preview, and reads it again when the width switches", async () => {
    mount();
    await userEvent.selectOptions(partsList(), "heading");
    expect(await within(italicSelect()).findByRole("option", { name: italicDefault("off") })).toBeTruthy();

    const theme = new CSSStyleSheet();
    theme.replaceSync(".appearance-preview { font-style: italic; }");
    document.adoptedStyleSheets = [theme];
    try {
      await switchTo("narrow");

      expect(await within(italicSelect()).findByRole("option", { name: italicDefault("on") })).toBeTruthy();
    } finally {
      document.adoptedStyleSheets = [];
    }
  });
});
