import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { CalendarDate } from "@/calendar";
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

function todayOption(): HTMLOptionElement {
  return within(partsList()).getByRole<HTMLOptionElement>("option", { name: new RegExp(`^${partName("today")}`) });
}

function todayCell(container: Element): HTMLElement {
  const cell = container.querySelector<HTMLElement>('[data-preview-part="date"][data-anchor="2026-05-13"]');
  if (!cell) throw new Error("no preview cell for today");
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

async function switchTo(width: "wide" | "narrow"): Promise<void> {
  await userEvent.click(screen.getByRole("radio", { name: m.calendar_appearance_width({ width }) }));
}

beforeAll(() => initLocale("en"));

describe("AppearanceSubpage", () => {
  let harness: TestHarness;
  const slice = () => harness.settings.getSlice(appearanceSlice);
  let nav: { back: Mock; push: Mock; replace: Mock };
  const mount = () => harness.render(AppearanceSubpage, { props: { nav } });

  beforeEach(async () => {
    nav = { back: vi.fn(), push: vi.fn(), replace: vi.fn() };
    vi.spyOn(CalendarDate, "today").mockReturnValue(date("2026-05-13"));
    harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
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

  it("a preview pick edits the first part and lists the others as also here", async () => {
    const { container } = mount();

    await userEvent.click(todayCell(container));

    expect(partsList().value).toBe("selected");
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual((["today", "date", "cell"] as const).map(partName));
    expect(screen.getByText("--journal-cell-selected-ring-width")).toBeTruthy();

    await userEvent.click(chips()[0]);

    expect(partsList().value).toBe("today");
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual(
      (["selected", "date", "cell"] as const).map(partName),
    );
  });

  it("hides also here when the spot holds only the edited part", async () => {
    const { container } = mount();
    const weekNumber = container.querySelector<HTMLElement>('[data-preview-part="weekNumber"]');
    if (!weekNumber) throw new Error("no week number in the preview");

    await userEvent.click(weekNumber);

    expect(partsList().value).toBe("weekNumber");
    expect(screen.queryByRole("group", { name: m.calendar_appearance_also_here() })).toBeNull();
  });

  it("outlines the edited part in the preview", async () => {
    const { container } = mount();

    await userEvent.click(todayCell(container));
    expect(outlined(container)).toEqual([todayCell(container)]);

    await userEvent.selectOptions(partsList(), "weekNumber");
    expect(outlined(container)).toEqual([...container.querySelectorAll('[data-preview-part="weekNumber"]')]);
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

  it("the parts list reaches every part", async () => {
    mount();

    const offered = [...partsList().options].filter((option) => option.value !== "");
    expect(offered).toHaveLength(9);

    await userEvent.selectOptions(partsList(), "weekday");

    expect(screen.getByText("--journal-cell-weekday-size")).toBeTruthy();
    expect(chips()).toEqual([]);
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

  it("a modified part carries the marker in the chips and the parts list, per width", async () => {
    const { container } = mount();
    slice().state = withValue(slice().state, "wide", "today", ["ringWidth"], 3);
    await userEvent.click(todayCell(container));

    const todayChip = () => chips()[0];
    const modified = m.calendar_appearance_modified();
    expect(todayOption().textContent).toContain("•");
    expect(todayOption().getAttribute("aria-label")).toContain(modified);
    expect(todayChip().classList.contains("is-modified")).toBe(true);
    expect(within(todayChip()).getByText(modified)).toBeTruthy();
    expect(chips()[1].textContent).not.toContain(modified);

    await switchTo("narrow");

    expect(todayOption().textContent).not.toContain("•");
    expect(todayOption().getAttribute("aria-label")).toBeNull();
    expect(todayChip().classList.contains("is-modified")).toBe(false);
    expect(todayChip().textContent).not.toContain(modified);
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
});
