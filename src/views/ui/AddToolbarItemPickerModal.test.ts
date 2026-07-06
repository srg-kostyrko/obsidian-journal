import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import AddToolbarItemPickerModal from "./AddToolbarItemPickerModal.vue";

import type { ToolbarItemDefinition } from "../define-toolbar-item";

afterEach(() => cleanup());

function toolbarItemDefinition(key: string, label: string): ToolbarItemDefinition {
  return {
    key,
    label,
    schema: v.object({}),
    defaultConfig: {},
    component: { render: () => null },
    __brand: "toolbar-item",
  } as unknown as ToolbarItemDefinition;
}

function toolbarItemDefinitionWithPresets(
  key: string,
  label: string,
  presets: { label: string; defaultConfig: unknown }[],
): ToolbarItemDefinition {
  return {
    key,
    label,
    schema: v.object({}),
    defaultConfig: {},
    presets,
    component: { render: () => null },
    __brand: "toolbar-item",
  } as unknown as ToolbarItemDefinition;
}

function mountModal(definitions: ToolbarItemDefinition[]) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ key: string; defaultConfig: unknown }> = { submit, cancel };
  render(AddToolbarItemPickerModal, {
    props: { definitions },
    global: { plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }] },
  });
  return { submit, cancel };
}

describe("AddToolbarItemPickerModal", () => {
  describe("when a definition has no presets", () => {
    it("renders one row per definition", () => {
      mountModal([toolbarItemDefinition("shelf-selector", "Shelf selector")]);
      expect(screen.getByText("Shelf selector")).toBeTruthy();
    });
  });

  describe("when a definition has presets", () => {
    it("renders one row per preset", () => {
      mountModal([
        toolbarItemDefinitionWithPresets("button", "Button", [
          { label: "Today", defaultConfig: { action: "today" } },
          { label: "Previous", defaultConfig: { action: "previous" } },
          { label: "Next", defaultConfig: { action: "next" } },
        ]),
      ]);
      expect(screen.getByText("Today")).toBeTruthy();
      expect(screen.getByText("Previous")).toBeTruthy();
      expect(screen.getByText("Next")).toBeTruthy();
    });
  });

  describe("when the add button is clicked", () => {
    it("calls api.submit with the key and defaultConfig", async () => {
      const { submit } = mountModal([toolbarItemDefinition("shelf-selector", "Shelf selector")]);
      await userEvent.click(
        screen.getByRole("button", { name: m.view_add_picker_action({ label: "Shelf selector" }) }),
      );
      expect(submit).toHaveBeenCalledWith({ key: "shelf-selector", defaultConfig: {} });
    });
  });

  describe("when no definitions are registered", () => {
    it("shows the empty-state message", () => {
      mountModal([]);
      expect(screen.getByText(m.view_add_toolbar_item_empty())).toBeTruthy();
    });
  });

  describe("when the Cancel button is clicked", () => {
    it("calls api.cancel()", async () => {
      const { cancel } = mountModal([toolbarItemDefinition("shelf-selector", "Shelf selector")]);
      await userEvent.click(screen.getByText(m.common_action_cancel()));
      expect(cancel).toHaveBeenCalledTimes(1);
    });
  });
});
