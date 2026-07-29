import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import {
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { icons } from "@/ui/icons";

import { buttonConfigFor } from "./button-config";
import ButtonItemConfig from "./ui/ButtonItemConfig.vue";

import type { ButtonConfig, ButtonConfigChange } from "./button-config";

function mountConfig(config: ButtonConfig, onChange: ButtonConfigChange) {
  const container = new Container();
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  const storage = reactive<Record<string, JournalConfig>>({
    daily: journalDefaultsFor({ type: "day" }, "daily"),
    weekly: journalDefaultsFor({ type: "week" }, "weekly"),
  });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  return render(ButtonItemConfig, {
    props: { config, onChange },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

const baseConfig: ButtonConfig = {
  action: { type: "current", mode: "create", levels: ["day"] },
};

afterEach(() => cleanup());

describe("ButtonItemConfig", () => {
  it("shows the action's seeded icon in the icon field", () => {
    mountConfig(buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }), vi.fn());
    const [iconInput] = screen.getAllByRole("textbox");
    expect((iconInput as HTMLInputElement).value).toBe(icons.action.pickDate);
  });

  it("emits the full config when an appearance field changes", async () => {
    const onChange = vi.fn();
    mountConfig(baseConfig, onChange);
    const [iconInput] = screen.getAllByRole("textbox");
    await userEvent.type(iconInput, "star");
    expect(onChange).toHaveBeenLastCalledWith({ ...baseConfig, icon: "star" });
  });

  it("restores the current action's icon when the icon reset is pressed", async () => {
    const onChange = vi.fn();
    const config: ButtonConfig = {
      action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
      icon: icons.nav.prev,
    };
    mountConfig(config, onChange);
    const resetButtons = screen.getAllByRole("button", { name: m.view_toolbar_appearance_reset() });
    await userEvent.click(resetButtons[0]);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, icon: icons.nav.next });
  });

  describe("action mode", () => {
    it("emits onChange with the selected mode when the behavior dropdown changes", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      const [, modeDropdown] = screen.getAllByRole("combobox");
      await userEvent.selectOptions(modeDropdown, "navigate");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "navigate", levels: ["day"] },
      });
    });
  });

  describe("journal selection", () => {
    it("hides the period-level toggles when a journal is pinned", () => {
      mountConfig({ action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" } }, vi.fn());
      expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
    });

    it("shows the period-level toggles when no journal is pinned", () => {
      mountConfig(baseConfig, vi.fn());
      expect(screen.getByRole("button", { name: "Week" })).toBeTruthy();
    });

    it("emits onChange with the pinned journal when one is selected", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      await userEvent.selectOptions(screen.getByLabelText("Journal"), "weekly");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" },
      });
    });

    it("clears the pinned journal when the default option is chosen", async () => {
      const onChange = vi.fn();
      mountConfig({ action: { type: "current", mode: "create", levels: ["day"], journal: "weekly" } }, onChange);
      await userEvent.selectOptions(screen.getByLabelText("Journal"), "");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["day"], journal: undefined },
      });
    });
  });

  describe("action levels", () => {
    it("adds a period level when its toggle is enabled", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Week" }));
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["day", "week"] },
      });
    });

    it("orders enabled levels canonically regardless of toggle order", async () => {
      const onChange = vi.fn();
      mountConfig({ action: { type: "current", mode: "create", levels: ["month"] } }, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Day" }));
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["day", "month"] },
      });
    });

    it("removes a period level when its toggle is disabled", async () => {
      const onChange = vi.fn();
      mountConfig({ action: { type: "current", mode: "create", levels: ["day", "week"] } }, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Day" }));
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "current", mode: "create", levels: ["week"] },
      });
    });

    it("keeps the last remaining level when its toggle is disabled", async () => {
      const onChange = vi.fn();
      mountConfig(baseConfig, onChange);
      await userEvent.click(screen.getByRole("button", { name: "Day" }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("navigate-step action", () => {
    const stepConfig: ButtonConfig = {
      action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
    };

    it("renders no period-level toggles", () => {
      mountConfig(stepConfig, vi.fn());
      expect(screen.queryByRole("button", { name: "Day" })).toBeNull();
    });

    it("renders exactly the direction and granularity dropdowns", () => {
      mountConfig(stepConfig, vi.fn());
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("emits onChange with the selected direction when the direction dropdown changes", async () => {
      const onChange = vi.fn();
      mountConfig(stepConfig, onChange);
      const [directionDropdown] = screen.getAllByRole("combobox");
      await userEvent.selectOptions(directionDropdown, "prev");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 },
      });
    });

    it("emits onChange with the selected granularity when the granularity dropdown changes", async () => {
      const onChange = vi.fn();
      mountConfig(stepConfig, onChange);
      const [, granularityDropdown] = screen.getAllByRole("combobox");
      await userEvent.selectOptions(granularityDropdown, "quarter");
      expect(onChange).toHaveBeenLastCalledWith({
        action: { type: "navigate-step", direction: "next", unit: "quarter", amount: 1 },
      });
    });
  });
});
