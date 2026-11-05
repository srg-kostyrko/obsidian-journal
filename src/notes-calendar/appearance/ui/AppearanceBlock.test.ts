import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { SettingsUiService } from "@/settings";
import { testContainer } from "@/testing";

import { calendarAppearanceCoreModule } from "../module";
import { calendarAppearanceUiModule } from "../ui-module";

import { appearanceSubpage } from "./appearance-subpage";
import AppearanceBlock from "./AppearanceBlock.vue";

beforeAll(() => initLocale("en"));

describe("AppearanceBlock", () => {
  it("Open pushes the appearance subpage", async () => {
    const harness = await testContainer({ modules: [calendarAppearanceCoreModule, calendarAppearanceUiModule] });
    const ui = harness.resolve(SettingsUiService);
    harness.render(AppearanceBlock);

    expect(screen.getByText(m.calendar_appearance_section_title())).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: m.calendar_appearance_open() }));

    expect(ui.current.value?.subpage.key).toBe(appearanceSubpage.key);
  });
});
