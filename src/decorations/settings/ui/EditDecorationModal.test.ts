import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Calendar } from "@/calendar";
import type { JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, MetadataTypeService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { InternalObsidianAppToken } from "@/infrastructure/host/internal/tokens";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import EditDecorationModal from "./EditDecorationModal.vue";

afterEach(() => cleanup());

const transparent = { type: "transparent" as const };
const minimalDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: transparent }],
};

function mountModal(options: {
  writeType: "day" | "week" | "month" | "quarter" | "year" | "custom";
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
    props: { journalName: "daily", writeType: options.writeType, decoration: options.decoration },
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
        writeType: "day",
        decoration: { mode: "and", conditions: [], styles: [{ type: "background", color: transparent }] },
      });
      expect(screen.getByText(m.common_action_submit()).closest("button")?.disabled).toBe(true);
    });

    it("disables Save when no styles are defined", () => {
      mountModal({
        writeType: "day",
        decoration: { mode: "and", conditions: [{ type: "has-note" }], styles: [] },
      });
      expect(screen.getByText(m.common_action_submit()).closest("button")?.disabled).toBe(true);
    });

    it("submits when both arrays are populated", async () => {
      const { submit } = mountModal({ writeType: "day", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ decoration: expect.objectContaining({ mode: "and" }) as unknown });
      });
    });

    it("blocks submit and shows an error when a property condition has a blank name", async () => {
      const { submit } = mountModal({
        writeType: "day",
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
      mountModal({ writeType: "day", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "date" }))).toBeTruthy();
      expect(screen.getByText(m.decoration_condition_type_label({ type: "weekday" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "offset" }))).toBeNull();
    });

    it("offers offset for custom write type but not date or weekday", async () => {
      mountModal({ writeType: "custom", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.getByText(m.decoration_condition_type_label({ type: "offset" }))).toBeTruthy();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "date" }))).toBeNull();
    });

    it("offers only common types for week write type", async () => {
      mountModal({ writeType: "week", decoration: minimalDecoration });
      await userEvent.click(screen.getByText(m.decoration_modal_add_condition()));
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "date" }))).toBeNull();
      expect(screen.queryByText(m.decoration_condition_type_label({ type: "offset" }))).toBeNull();
    });
  });

  describe("mode change", () => {
    it("reflects the chosen mode in the submitted decoration", async () => {
      const { submit } = mountModal({ writeType: "day", decoration: { ...minimalDecoration, mode: "and" } });
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
});
