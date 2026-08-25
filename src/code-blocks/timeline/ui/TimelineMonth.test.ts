import { fireEvent } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { decorationsModule } from "@/decorations/module";
import { decorationsSettingsCoreModule } from "@/decorations/settings/module";
import { initLocale } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { OpenDateFlow } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import TimelineMonth from "./TimelineMonth.vue";

const MODULES = [
  journalsCoreModule,
  shelvesCoreModule,
  decorationsModule,
  decorationsSettingsCoreModule,
  notesCalendarModule,
];

beforeAll(() => initLocale("en"));

describe("TimelineMonth", () => {
  it("keeps adjacent-month days actionable", async () => {
    // Unlike quarter/calendar mode, which blanks overflow days, month mode keeps them
    // open so a leading/trailing day can still open its note.
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({} as never);

    const { container } = harness.render(TimelineMonth, { props: { refDate: anchor("2026-05-15"), shelf: null } });

    const outsideDay = container.querySelector<HTMLElement>(".notes-month-view__day[data-outside]");
    expect(outsideDay).not.toBeNull();
    expect(outsideDay?.dataset.inactive).toBeUndefined();
    expect(outsideDay?.getAttribute("role")).toBe("button");

    const outsideAnchor = outsideDay?.dataset.anchor;
    if (outsideDay) await fireEvent.click(outsideDay);

    expect(harness.resolve(Flows).invoke).toHaveBeenCalledWith(
      OpenDateFlow,
      expect.objectContaining({ anchor: outsideAnchor, journalNames: ["daily"] }),
    );
  });
});
