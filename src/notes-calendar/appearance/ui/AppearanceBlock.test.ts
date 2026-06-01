import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { provideInjectorOnApp, type Container } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { appearanceSlice, type AppearanceSliceState } from "../slice";

import AppearanceBlock from "./AppearanceBlock.vue";

function setup(initial?: AppearanceSliceState) {
  const raw = initial ? { version: 3, appearance: initial } : undefined;
  const created = createSettingsService({ slices: [appearanceSlice], raw });
  return { container: created.container, settings: created.service };
}

function mount(container: Container) {
  return render(AppearanceBlock, {
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

async function openSection(): Promise<void> {
  await userEvent.click(screen.getByText(m.calendar_appearance_section_title()));
}

beforeAll(() => initLocale("en"));
afterEach(() => cleanup());

describe("AppearanceBlock", () => {
  it("starts collapsed and hides the highlight color rows", async () => {
    const { container, settings } = setup();
    await settings.initialize();
    mount(container);
    expect(screen.queryByText(m.calendar_appearance_today_text())).toBeNull();
  });

  it("reveals the highlight color rows once expanded", async () => {
    const { container, settings } = setup();
    await settings.initialize();
    mount(container);
    await openSection();
    expect(screen.getByText(m.calendar_appearance_today_text())).toBeTruthy();
  });

  it("writes a today text color change back to the slice", async () => {
    const { container, settings } = setup();
    await settings.initialize();
    mount(container);
    await openSection();
    const slice = settings.getSlice(appearanceSlice);
    slice.state = { ...slice.state, today: { ...slice.state.today, color: { type: "custom", color: "#abcdef" } } };
    expect(settings.getSlice(appearanceSlice).state.today.color).toEqual({ type: "custom", color: "#abcdef" });
  });
});
