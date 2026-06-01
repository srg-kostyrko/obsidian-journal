import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { JournalsRepository } from "../../repository";
import { fakeRepo, fixedJournal } from "../../testing";
import { startupSlice } from "../slice";

import StartupBlock from "./StartupBlock.vue";

async function setup() {
  const created = createSettingsService({ slices: [startupSlice] });
  const container = created.container;
  container.register(JournalsRepository).useValue(
    fakeRepo({
      daily: fixedJournal("daily", { type: "day" }),
      weekly: fixedJournal("weekly", { type: "week" }),
    }),
  );
  await created.service.initialize();
  return { container, settings: created.service };
}

function mount(container: Container) {
  return render(StartupBlock, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

async function expand(): Promise<void> {
  await userEvent.click(screen.getByText(m.startup_dashboard_section_title()));
}

afterEach(() => cleanup());

describe("StartupBlock", () => {
  it("offers a 'Don't open' choice plus one option per journal", async () => {
    const { container } = await setup();
    mount(container);
    await expand();
    expect(screen.getByRole("option", { name: m.startup_dont_open_option() })).toBeTruthy();
    expect(screen.getByRole("option", { name: "daily" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "weekly" })).toBeTruthy();
  });

  it("writes the chosen journal to the slice", async () => {
    const { container, settings } = await setup();
    mount(container);
    await expand();
    await userEvent.selectOptions(screen.getByRole("combobox"), "weekly");
    expect(settings.getSlice(startupSlice).state.journalName).toBe("weekly");
  });
});
