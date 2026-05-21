import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import { dateModificationsModal } from "./date-modifications-modal";
import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";

afterEach(() => cleanup());

function renderModal(props: {
  context: VariableModalContext;
  hasCycle?: boolean;
  numberingVariableNames?: readonly string[];
}) {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  render(VariableReferenceModal, {
    props: {
      journalName: "daily",
      dateFormat: "YYYY-MM-DD",
      hasCycle: false,
      numberingVariableNames: [],
      ...props,
    },
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
  return { modals };
}

describe("VariableReferenceModal — rules table", () => {
  describe.each(["name-template", "folder-path", "template-path"] as const)("%s", (context: VariableModalContext) => {
    it("renders the date variable", () => {
      renderModal({ context });
      expect(screen.getByText("{{date}}")).toBeTruthy();
    });

    it("renders the journal_name variable", () => {
      renderModal({ context });
      expect(screen.getByText("{{journal_name}}")).toBeTruthy();
    });

    it("omits start_date and end_date when hasCycle is false", () => {
      renderModal({ context, hasCycle: false });
      expect(screen.queryByText("{{start_date}}")).toBeNull();
      expect(screen.queryByText("{{end_date}}")).toBeNull();
    });

    it("renders start_date and end_date when hasCycle is true", () => {
      renderModal({ context, hasCycle: true });
      expect(screen.getByText("{{start_date}}")).toBeTruthy();
      expect(screen.getByText("{{end_date}}")).toBeTruthy();
    });

    it("renders one row per numbering variable name", () => {
      renderModal({ context, numberingVariableNames: ["week_no", "page_no"] });
      expect(screen.getByText("{{week_no}}")).toBeTruthy();
      expect(screen.getByText("{{page_no}}")).toBeTruthy();
    });

    it("never renders note_name or title", () => {
      renderModal({ context });
      expect(screen.queryByText("{{note_name}}")).toBeNull();
      expect(screen.queryByText("{{title}}")).toBeNull();
    });

    it("renders current_date", () => {
      renderModal({ context });
      expect(screen.getByText("{{current_date}}")).toBeTruthy();
    });

    it("renders time", () => {
      renderModal({ context });
      expect(screen.getAllByText("{{time}}").length).toBeGreaterThanOrEqual(1);
    });

    it("renders current_time", () => {
      renderModal({ context });
      expect(screen.getByText("{{current_time}}")).toBeTruthy();
    });
  });

  describe("non-invertibility warning", () => {
    it("shows the warning on clock vars in name-template", () => {
      renderModal({ context: "name-template" });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("shows the warning on clock vars in folder-path", () => {
      renderModal({ context: "folder-path" });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("does NOT show the warning in template-path", () => {
      renderModal({ context: "template-path" });
      expect(screen.queryByText(/recovering the date from the filename/i)).toBeNull();
    });
  });

  describe("additional-modifications link", () => {
    it("renders a link on every date/clock row", () => {
      renderModal({ context: "name-template" });
      const links = screen.getAllByRole("link", { name: /additional modifications/i });
      expect(links.length).toBe(4);
    });

    it("opens the modifications sub-modal when the link is clicked", async () => {
      const { modals } = renderModal({ context: "name-template" });
      await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
      expect(modals.opens.length).toBe(1);
      expect(modals.lastOpen().definition).toBe(dateModificationsModal);
    });
  });
});
