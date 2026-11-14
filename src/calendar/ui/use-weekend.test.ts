import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { calendarDisplaySlice } from "@/calendar/settings/display-slice";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { testContainer } from "@/testing";

import { useWeekend } from "./use-weekend";

describe("useWeekend", () => {
  it("follows a write to the weekend setting", async () => {
    const harness = await testContainer({ modules: [calendarSettingsCoreModule], data: { calendarDisplay: {} } });
    const Probe = defineComponent({
      setup() {
        const weekend = useWeekend();
        return () => h("p", { "data-testid": "probe" }, [...weekend.value].toSorted().join(","));
      },
    });
    harness.render(Probe);
    expect(screen.getByTestId("probe").textContent).toBe("0,6");

    const slice = harness.settings.getSlice(calendarDisplaySlice);
    slice.state = { ...slice.state, weekend: { type: "custom", days: [5] } };
    await Promise.resolve();
    expect(screen.getByTestId("probe").textContent).toBe("5");
  });
});
