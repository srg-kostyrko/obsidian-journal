import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { SettingsUiService } from "@/settings";
import { testContainer } from "@/testing";

import { maintenanceUiModule } from "../ui-module";

import MaintenanceBlock from "./MaintenanceBlock.vue";

describe("MaintenanceBlock", () => {
  it("opens the maintenance subpage when the user clicks the open button", async () => {
    const harness = await testContainer({
      modules: [maintenanceUiModule],
    });
    const ui = harness.resolve(SettingsUiService);
    harness.render(MaintenanceBlock);

    await userEvent.click(screen.getByText(m.maintenance_open()));

    expect(ui.current.value?.subpage.key).toBe("maintenance");
  });
});
