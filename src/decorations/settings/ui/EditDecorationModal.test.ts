import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import type { JournalDecoration, JournalDecorationCondition } from "@/decorations";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, MetadataTypeService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import { CALENDAR_CONDITION_TYPES, conditionTypeOptions } from "./condition-types";
import EditDecorationModal from "./EditDecorationModal.vue";

afterEach(() => cleanup());

const transparent = { type: "transparent" as const };
const minimalDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: transparent }],
};

function mountModal(options: {
  conditionTypes: readonly JournalDecorationCondition["type"][];
  decoration?: JournalDecoration;
}) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ decoration: JournalDecoration }> = { submit, cancel };
  const container = new Container();
  container.register(Calendar).useValue(new Calendar());
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(InternalObsidianAppToken).useValue(createFakeHost().app);
  container.register(MetadataTypeService).useClass(MetadataTypeService);
  render(EditDecorationModal, {
    props: { conditionTypes: options.conditionTypes, decoration: options.decoration },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("EditDecorationModal", () => {
  describe("submit gating", () => {
    it("disables Save when no conditions are defined", () => {
      mountModal({
        conditionTypes: conditionTypeOptions.day,
        decoration: { mode: "and", conditions: [], styles: [{ type: "background", color: transparent }] },
      });
      expect(screen.getByText(m.common_action_submit()).closest("button")?.disabled).toBe(true);
    });

    it("disables Save when no styles are defined", () => {
      mountModal({
        conditionTypes: conditionTypeOptions.day,
        decoration: { mode: "and", conditions: [{ type: "has-note" }], styles: [] },
      });
      expect(screen.getByText(m.common_action_submit()).closest("button")?.disabled).toBe(true);
    });

    it("submits when both arrays are populated", async () => {
      const { submit } = mountModal({ conditionTypes: conditionTypeOptions.day, decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ decoration: expect.objectContaining({ mode: "and" }) as unknown });
      });
    });

    it("blocks submit and shows an error when a property condition has a blank name", async () => {
      const { submit } = mountModal({
        conditionTypes: conditionTypeOptions.day,
        decoration: {
          mode: "and",
          conditions: [{ type: "property", name: "", valueType: "text", condition: "exists", value: "" }],
          styles: [{ type: "background", color: transparent }],
        },
      });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => expect(screen.getByText(m.journal_property_name_required())).toBeTruthy());
      expect(submit).not.toHaveBeenCalled();
    });
  });

  describe("add-condition options", () => {
    it("offers date and weekday for day write type", async () => {
      mountModal({ conditionTypes: conditionTypeOptions.day, decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "date" }))).toBeTruthy();
      expect(screen.getByText(m.decoration_condition_type_label({ type: "weekday" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "offset" }))).toBeNull();
    });

    it("offers offset for custom write type but not date or weekday", async () => {
      mountModal({ conditionTypes: conditionTypeOptions.custom, decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "offset" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "date" }))).toBeNull();
    });

    it("offers only common types for week write type", async () => {
      mountModal({ conditionTypes: conditionTypeOptions.week, decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "date" }))).toBeNull();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "offset" }))).toBeNull();
    });

    it("offers only date and weekday for a calendar owner", async () => {
      mountModal({ conditionTypes: CALENDAR_CONDITION_TYPES });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "date" }))).toBeTruthy();
      expect(screen.getByText(m.decoration_condition_type_label({ type: "weekday" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "has-note" }))).toBeNull();
    });
  });

  describe("mode change", () => {
    it("reflects the chosen mode in the submitted decoration", async () => {
      const { submit } = mountModal({
        conditionTypes: conditionTypeOptions.day,
        decoration: { ...minimalDecoration, mode: "and" },
      });
      await userEvent.selectOptions(
        screen.getByDisplayValue(m.decoration_modal_mode_option({ kind: "and" })),
        m.decoration_modal_mode_option({ kind: "or" }),
      );
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ decoration: expect.objectContaining({ mode: "or" }) as unknown });
      });
    });
  });

  describe("removing a condition", () => {
    it("does not leak the removed condition's fields into the one that shifts into its place", async () => {
      const { submit } = mountModal({
        conditionTypes: conditionTypeOptions.day,
        decoration: {
          mode: "and",
          conditions: [
            { type: "title", condition: "contains", value: "draft" },
            { type: "weekday", weekdays: [1, 2] },
          ],
          styles: [{ type: "background", color: transparent }],
        },
      });
      await userEvent.click(screen.getAllByRole("button", { name: "" })[0]);
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({
          decoration: expect.objectContaining({
            conditions: [{ type: "weekday", weekdays: [1, 2] }],
          }) as unknown,
        });
      });
    });
  });

  describe("style canvas", () => {
    it("keeps the submit button disabled until the decoration has a style", async () => {
      mountModal({ conditionTypes: conditionTypeOptions.day });
      await userEvent.click(screen.getByRole("button", { name: m.decoration_modal_add_condition() }));
      await userEvent.click(
        screen.getByRole("button", { name: m.decoration_condition_type_label({ type: "has-note" }) }),
      );
      expect(screen.getByRole<HTMLButtonElement>("button", { name: m.common_action_create() }).disabled).toBe(true);
    });

    it("enables submit once a condition and a style are present", async () => {
      mountModal({ conditionTypes: conditionTypeOptions.day });
      await userEvent.click(screen.getByRole("button", { name: m.decoration_modal_add_condition() }));
      await userEvent.click(
        screen.getByRole("button", { name: m.decoration_condition_type_label({ type: "has-note" }) }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: m.decoration_canvas_region_label({ type: "background" }) }),
      );
      expect(screen.getByRole<HTMLButtonElement>("button", { name: m.common_action_create() }).disabled).toBe(false);
    });

    it("no longer offers an add-style dropdown", () => {
      mountModal({ conditionTypes: conditionTypeOptions.day });
      expect(screen.queryByRole("button", { name: m.decoration_modal_add_style() })).toBeNull();
    });
  });
});
