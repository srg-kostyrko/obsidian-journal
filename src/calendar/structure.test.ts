import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { testContainer } from "@/testing";

import { calendarDisplaySlice } from "./settings/display-slice";
import { resolveOutsideDates, resolveStructure, useResolvedStructure } from "./structure";

describe("resolveStructure", () => {
  it("returns the global when the block is unset", () => {
    expect(resolveStructure(undefined, "left")).toBe("left");
  });

  it("returns the global when the block is 'default', including a false global", () => {
    expect(resolveStructure("default", false)).toBe(false);
  });

  it("returns an explicit block value unchanged", () => {
    expect(resolveStructure("right", "left")).toBe("right");
  });

  it("keeps an explicit false over a true global", () => {
    expect(resolveStructure(false, true)).toBe(false);
  });
});

describe("resolveOutsideDates", () => {
  it("maps each explicit choice onto the month view's vocabulary", () => {
    expect(resolveOutsideDates("interactive", "blank")).toBe("active");
    expect(resolveOutsideDates("inert", "active")).toBe("inactive");
    expect(resolveOutsideDates("hidden", "active")).toBe("blank");
  });

  it("passes the surface's own rule through on automatic", () => {
    expect(resolveOutsideDates("automatic", "blank")).toBe("blank");
    expect(resolveOutsideDates("automatic", "active")).toBe("active");
  });
});

describe("useResolvedStructure", () => {
  it("follows a later write to the global slice while the block says 'default'", async () => {
    const harness = await testContainer({ modules: [calendarSettingsCoreModule], data: { calendarDisplay: {} } });
    const Probe = defineComponent({
      setup() {
        const heading = useResolvedStructure("showHeading", () => "default");
        return () => h("p", { "data-testid": "probe" }, String(heading.value));
      },
    });
    harness.render(Probe);
    expect(screen.getByTestId("probe").textContent).toBe("true");

    harness.settings.getSlice(calendarDisplaySlice).state = {
      ...harness.settings.getSlice(calendarDisplaySlice).state,
      showHeading: false,
    };
    await Promise.resolve();
    expect(screen.getByTestId("probe").textContent).toBe("false");
  });
});
