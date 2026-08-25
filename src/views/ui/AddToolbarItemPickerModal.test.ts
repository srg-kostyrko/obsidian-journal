import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { buildToolbarItemDefinition } from "../testing";

import AddToolbarItemPickerModal from "./AddToolbarItemPickerModal.vue";

describe("AddToolbarItemPickerModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  describe("when a definition has no presets", () => {
    it("renders one row per definition", () => {
      harness.renderModal(AddToolbarItemPickerModal, {
        props: { definitions: [buildToolbarItemDefinition("shelf-selector", { label: () => "Shelf selector" })] },
      });

      expect(screen.getByText("Shelf selector")).toBeTruthy();
    });
  });

  describe("when a definition has presets", () => {
    it("renders one row per preset", () => {
      harness.renderModal(AddToolbarItemPickerModal, {
        props: {
          definitions: [
            buildToolbarItemDefinition("button", {
              label: () => "Button",
              presets: [
                { label: () => "Today", defaultConfig: () => ({ action: "today" }) },
                { label: () => "Previous", defaultConfig: () => ({ action: "previous" }) },
                { label: () => "Next", defaultConfig: () => ({ action: "next" }) },
              ],
            }),
          ],
        },
      });

      expect(screen.getByText("Today")).toBeTruthy();
      expect(screen.getByText("Previous")).toBeTruthy();
      expect(screen.getByText("Next")).toBeTruthy();
    });

    it("renders each preset's own description", () => {
      harness.renderModal(AddToolbarItemPickerModal, {
        props: {
          definitions: [
            buildToolbarItemDefinition("button", {
              label: () => "Button",
              presets: [
                { label: () => "Today", description: () => "Jump to now", defaultConfig: () => ({ action: "today" }) },
                {
                  label: () => "Navigate",
                  description: () => "Step by interval",
                  defaultConfig: () => ({ action: "next" }),
                },
              ],
            }),
          ],
        },
      });

      expect(screen.getByText("Jump to now")).toBeTruthy();
      expect(screen.getByText("Step by interval")).toBeTruthy();
    });
  });

  describe("when the add button is clicked", () => {
    it("calls api.submit with the key and defaultConfig", async () => {
      const { submit } = harness.renderModal(AddToolbarItemPickerModal, {
        props: { definitions: [buildToolbarItemDefinition("shelf-selector", { label: () => "Shelf selector" })] },
      });

      await userEvent.click(
        screen.getByRole("button", { name: m.view_add_picker_action({ label: "Shelf selector" }) }),
      );

      expect(submit).toHaveBeenCalledWith({ key: "shelf-selector", defaultConfig: {} });
    });
  });

  describe("when no definitions are registered", () => {
    it("shows the empty-state message", () => {
      harness.renderModal(AddToolbarItemPickerModal, { props: { definitions: [] } });

      expect(screen.getByText(m.view_add_toolbar_item_empty())).toBeTruthy();
    });
  });

  describe("when the Close button is clicked", () => {
    it("calls api.cancel()", async () => {
      const { cancel } = harness.renderModal(AddToolbarItemPickerModal, {
        props: { definitions: [buildToolbarItemDefinition("shelf-selector", { label: () => "Shelf selector" })] },
      });

      await userEvent.click(screen.getByText(m.common_action_close()));

      expect(cancel).toHaveBeenCalledTimes(1);
    });
  });
});
