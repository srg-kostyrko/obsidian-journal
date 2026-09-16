import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { calendarSettingsModule } from "@/calendar";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import { journalsSettingsModule } from "@/journals/settings/module";
import { startupModule } from "@/journals/startup/module";
import { shelvesModule } from "@/shelves";
import { testContainer } from "@/testing";

import { ImportFromPluginsFlow } from "../flows/import.flow";
import { importCoreModule } from "../module";
import { periodicNotesStorePlugin } from "../testing";

import ImportFromPluginsSection from "./ImportFromPluginsSection.vue";

const MODULES = [
  journalsCoreModule,
  journalsSettingsModule,
  calendarSettingsModule,
  startupModule,
  shelvesModule,
  importCoreModule,
];

describe("ImportFromPluginsSection", () => {
  it("says when no supported plugin is enabled", async () => {
    const harness = await testContainer({ modules: MODULES });

    harness.render(ImportFromPluginsSection);

    expect(await screen.findByText(m.import_section_none())).toBeTruthy();
  });

  it("stays available after the dashboard notice was dismissed", async () => {
    const harness = await testContainer({ modules: MODULES, data: { importNotice: { dismissed: true } } });
    harness.host.putCorePlugin("daily-notes", { options: {} });

    harness.render(ImportFromPluginsSection);

    expect(screen.getByRole("button", { name: m.import_action() }).hasAttribute("disabled")).toBe(false);
  });

  it("starts the import", async () => {
    const harness = await testContainer({ modules: MODULES });
    harness.host.putCorePlugin("daily-notes", { options: {} });
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok(undefined));
    harness.render(ImportFromPluginsSection);

    await userEvent.click(screen.getByRole("button", { name: m.import_action() }));

    expect(invoke).toHaveBeenCalledWith(ImportFromPluginsFlow);
  });

  it("says when the enabled plugins have nothing to import", async () => {
    const harness = await testContainer({ modules: MODULES });
    harness.host.putPlugin("periodic-notes", periodicNotesStorePlugin({ calendarSets: [] }));

    harness.render(ImportFromPluginsSection);

    expect(await screen.findByText(m.import_section_nothing())).toBeTruthy();
  });

  it("disables the button when the enabled plugins have nothing to import", async () => {
    const harness = await testContainer({ modules: MODULES });
    harness.host.putPlugin("periodic-notes", periodicNotesStorePlugin({ calendarSets: [] }));

    harness.render(ImportFromPluginsSection);
    await screen.findByText(m.import_section_nothing());

    expect(screen.getByRole("button", { name: m.import_action() }).hasAttribute("disabled")).toBe(true);
  });
});
