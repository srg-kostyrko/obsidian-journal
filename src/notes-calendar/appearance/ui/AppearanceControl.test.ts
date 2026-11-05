import userEvent from "@testing-library/user-event";
import { fireEvent, screen, within } from "@testing-library/vue";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, shallowRef } from "vue";

import { initLocale, m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";
import { themeColorGroupsFor } from "@/ui/theme-colors";

import { withValue } from "../appearance-editing";
import { PARTS, type Control, type PartKey, type Width } from "../appearance-parts";
import { calendarAppearanceCoreModule } from "../module";
import { appearanceSlice } from "../slice";

import AppearanceControl from "./AppearanceControl.vue";
import { AppearancePreviewRootKey } from "./preview-root-key";

function control(part: PartKey, ...path: string[]): Control {
  const found = PARTS[part].controls.find((candidate) => candidate.path.join(".") === path.join("."));
  if (!found) throw new Error(`no control ${path.join(".")}`);
  return found;
}

function kindSelect(container: Element): HTMLSelectElement {
  const select = container.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) throw new TypeError("no select");
  return select;
}

beforeAll(() => initLocale("en"));

describe("AppearanceControl", () => {
  let harness: TestHarness;
  const slice = () => harness.settings.getSlice(appearanceSlice);
  const mount = (part: PartKey, target: Control, width: Width = "wide") =>
    harness.render(AppearanceControl, { props: { part, control: target, width } });

  beforeEach(async () => {
    harness = await testContainer({ modules: [calendarAppearanceCoreModule] });
  });

  it.each(Object.entries(PARTS).flatMap(([part, { controls }]) => controls.map((c) => [part as PartKey, c] as const)))(
    "labels %s %o and each of its options with real copy",
    (part, target) => {
      const { container } = mount(part, target);

      const label = container.querySelector(".setting-item-name")?.textContent ?? "";
      const options = [...container.querySelectorAll("option")].map((option) => option.textContent ?? "");
      for (const text of [label, ...options]) {
        expect(text.trim()).not.toBe("");
        expect(text).not.toMatch(/calendar_appearance_/);
      }
    },
  );

  it("shows its public variable name", () => {
    mount("today", control("today", "text", "color"));

    expect(screen.getByText("--journal-cell-today-text-color")).toBeTruthy();
  });

  it("names the narrow variable while narrow is edited", () => {
    mount("cell", control("cell", "padding"), "narrow");

    expect(screen.getByText("--journal-cell-cell-padding-narrow")).toBeTruthy();
  });

  it("shows no variable name for the style, which no single variable carries", () => {
    const { container } = mount("today", control("today", "style"));

    expect(container.textContent).not.toContain("--journal");
  });

  it("offers Unchanged on a highlight text color, and not on a text color", () => {
    const highlight = mount("today", control("today", "text", "color"));
    const offered = [...kindSelect(highlight.container).options].map((option) => option.value);
    expect(offered).toContain("unchanged");
    highlight.unmount();

    const text = mount("heading", control("heading", "color"));
    expect([...kindSelect(text.container).options].map((option) => option.value)).not.toContain("unchanged");
  });

  it.each([
    ["ring", "border"],
    ["background", "background"],
  ] as const)("offers the %s highlight color the theme colors of the %s role", (style, role) => {
    slice().state = withValue(slice().state, "wide", "selected", ["style"], style);
    slice().state = withValue(slice().state, "wide", "selected", ["color"], { type: "theme", name: "" });
    mount("selected", control("selected", "color"));

    const offered = [
      ...screen.getByRole<HTMLSelectElement>("combobox", { name: m.ui_color_theme_variable_label() }).options,
    ]
      .map((option) => option.value)
      .filter((value) => value !== "");
    expect(offered).toEqual(themeColorGroupsFor(role).flatMap((group) => group.names));
  });

  it("writes a picked color through the model", async () => {
    const { container } = mount("today", control("today", "text", "color"));

    await userEvent.selectOptions(kindSelect(container), "unchanged");

    expect(slice().state.wide.today.text.color).toBe("unchanged");
  });

  it("speaks option names for a boolean leaf and writes the boolean", async () => {
    mount("selected", control("selected", "over"));
    const select = screen.getByRole<HTMLSelectElement>("combobox");
    expect(select.value).toBe("over");

    await userEvent.selectOptions(select, "under");

    expect(slice().state.wide.selected.over).toBe(false);
  });

  it.each([["weight"], ["italic"], ["case"]])("offers no Default on a set text %s while Narrow is edited", (leaf) => {
    slice().state = withValue(slice().state, "wide", "heading", ["weight"], "bold");
    slice().state = withValue(slice().state, "wide", "heading", ["italic"], true);
    slice().state = withValue(slice().state, "wide", "heading", ["case"], "upper");
    mount("heading", control("heading", leaf), "narrow");

    const offered = [...screen.getByRole<HTMLSelectElement>("combobox").options].map((option) => option.value);
    expect(offered).not.toContain("");
    expect(screen.queryByRole("option", { name: m.calendar_appearance_default() })).toBeNull();
  });

  it("offers Default on a text color, shows a null color as Default, and writes null for that leaf only", async () => {
    slice().state = withValue(slice().state, "wide", "heading", ["weight"], "bold");
    slice().state = withValue(slice().state, "wide", "heading", ["color"], { type: "custom", color: "#563412" });
    const { container } = mount("heading", control("heading", "color"));

    await userEvent.selectOptions(kindSelect(container), "default");

    expect(slice().state.wide.heading.color).toBeNull();
    expect(slice().state.wide.heading.weight).toBe("bold");
    expect(kindSelect(container).value).toBe("default");
    expect(screen.getAllByText(m.calendar_appearance_default()).map((element) => element.tagName)).toEqual(["OPTION"]);
  });

  it("offers no Default on a set text color while Narrow is edited", () => {
    slice().state = withValue(slice().state, "wide", "heading", ["color"], { type: "custom", color: "#563412" });
    const { container } = mount("heading", control("heading", "color"), "narrow");

    expect([...kindSelect(container).options].map((option) => option.value)).not.toContain("default");
  });

  it("offers Default on a text weight and writes null for it", async () => {
    slice().state = {
      ...slice().state,
      wide: { ...slice().state.wide, heading: { ...slice().state.wide.heading, weight: "bold" } },
    };
    mount("heading", control("heading", "weight"));
    const select = screen.getByRole<HTMLSelectElement>("combobox");

    await userEvent.selectOptions(
      select,
      within(select).getByRole("option", { name: m.calendar_appearance_default() }),
    );

    expect(slice().state.wide.heading.weight).toBeNull();
  });

  it("places a theme-expression stock at the value it renders as, marked Default, until the slider moves", async () => {
    document.body.setCssProps({ "--radius-s": "4px" });
    try {
      mount("cell", control("cell", "radius"));
      // The theme is read once the control is mounted, which settles before the first paint.
      expect(await screen.findByText("4px")).toBeTruthy();
      const range = screen.getByRole<HTMLInputElement>("slider");
      expect(range.value).toBe("4");
      expect(screen.getByText(m.calendar_appearance_default())).toBeTruthy();

      await fireEvent.update(range, "6");

      expect(slice().state.wide.cell.radius).toBe("6px");
      expect(screen.getByText("6px")).toBeTruthy();
      expect(screen.queryByText(m.calendar_appearance_default())).toBeNull();
    } finally {
      document.body.style.removeProperty("--radius-s");
    }
  });

  describe("names the value Default resolves to", () => {
    const theme = { "--font-normal": "400", "--font-semibold": "600", "--font-bold": "700", "--text-muted": "#999999" };
    beforeEach(() => {
      document.body.setCssProps(theme);
      return () => {
        for (const name of Object.keys(theme)) document.body.style.removeProperty(name);
      };
    });

    it("on a select, through the option's own label", async () => {
      mount("weekNumber", control("weekNumber", "weight"));

      const label = m.calendar_appearance_default_resolved({
        value: m.calendar_appearance_option({ option: "weight_bold" }),
      });
      expect(await screen.findByRole("option", { name: label })).toBeTruthy();
    });

    it("on a color, as a swatch beside Default", async () => {
      slice().state = withValue(slice().state, "wide", "weekday", ["color"], null);
      const { container } = mount("weekday", control("weekday", "color"));

      await vi.waitFor(() => {
        const swatch = container.querySelector<HTMLElement>(".ui-color-settings-picker__swatch");
        expect(swatch?.style.backgroundColor).toBe("#999999");
      });
    });

    it("from what the preview inherits, for an inherit stock", async () => {
      const theme = new CSSStyleSheet();
      theme.replaceSync(".preview-root-under-test { text-transform: uppercase; }");
      document.adoptedStyleSheets = [theme];
      const root = document.createElement("div");
      root.classList.add("preview-root-under-test");
      document.body.append(root);
      try {
        harness.render(AppearanceControl, {
          props: { part: "heading", control: control("heading", "case"), width: "wide" },
          global: { provide: { [AppearancePreviewRootKey as symbol]: shallowRef(root) } },
        });

        const label = m.calendar_appearance_default_resolved({
          value: m.calendar_appearance_option({ option: "case_upper" }),
        });
        expect(await screen.findByRole("option", { name: label })).toBeTruthy();
      } finally {
        root.remove();
        document.adoptedStyleSheets = [];
      }
    });
  });

  it("shows plain Default when the stock resolves to nothing", async () => {
    const { container } = mount("weekNumber", control("weekNumber", "weight"));
    await nextTick();

    expect(screen.getByRole("option", { name: m.calendar_appearance_default() })).toBeTruthy();
    expect(container.querySelector(".ui-color-settings-picker__swatch")).toBeNull();
  });

  it("shows Default alone when a stock cannot be placed", () => {
    mount("cell", control("cell", "radius"));

    expect(screen.getByText(m.calendar_appearance_default())).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("0");
  });

  it("writes a number to a numeric leaf", async () => {
    mount("cell", control("cell", "minHeight"));

    await fireEvent.update(screen.getByRole("slider"), "40");

    expect(slice().state.wide.cell.minHeight).toBe(40);
  });

  it("at Narrow writes a narrow override and tags it; clicking the tag clears it", async () => {
    mount("cell", control("cell", "padding"), "narrow");
    expect(screen.queryByRole("button", { name: m.calendar_appearance_narrow_only() })).toBeNull();

    await fireEvent.update(screen.getByRole("slider"), "6");

    expect(slice().state.narrow.cell.padding).toBe(6);
    expect(slice().state.wide.cell.padding).toBe(0);
    const tag = screen.getByRole("button", { name: m.calendar_appearance_narrow_only() });
    expect(tag.title).toBe(m.calendar_appearance_narrow_only_clear());

    await userEvent.click(tag);

    expect(slice().state.narrow.cell.padding).toBeNull();
    expect(screen.queryByRole("button", { name: m.calendar_appearance_narrow_only() })).toBeNull();
  });

  it("does not tag a narrow override while Wide is edited", () => {
    slice().state = {
      ...slice().state,
      narrow: { ...slice().state.narrow, cell: { ...slice().state.narrow.cell, padding: 6 } },
    };
    mount("cell", control("cell", "padding"), "wide");

    expect(screen.queryByRole("button", { name: m.calendar_appearance_narrow_only() })).toBeNull();
  });
});
