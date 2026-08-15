import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";

afterEach(() => cleanup());

function renderModal(props: {
  context: VariableModalContext;
  hasCycle?: boolean;
  numberingVariableNames?: readonly string[];
  openModifications?: () => void;
}) {
  const openModifications = props.openModifications ?? vi.fn();
  render(VariableReferenceModal, {
    props: {
      journalName: "daily",
      dateFormat: "YYYY-MM-DD",
      hasCycle: false,
      numberingVariableNames: [],
      ...props,
      openModifications,
    },
  });
  return { openModifications };
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

  describe("note name variables", () => {
    // note_name/title are bound after the filename renders, so the name template itself
    // can't use them; folder and template paths can.
    it("omits note_name and title in the name-template context", () => {
      renderModal({ context: "name-template" });
      expect(screen.queryByText("{{note_name}}")).toBeNull();
      expect(screen.queryByText("{{title}}")).toBeNull();
    });

    it.each(["folder-path", "template-path", "nav-row"] as const)("renders note_name and title in %s", (context) => {
      renderModal({ context });
      expect(screen.getByText("{{note_name}}")).toBeTruthy();
      expect(screen.getByText("{{title}}")).toBeTruthy();
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

    it("invokes openModifications when the link is clicked", async () => {
      const openModifications = vi.fn();
      renderModal({ context: "name-template", openModifications });
      await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
      expect(openModifications).toHaveBeenCalledTimes(1);
    });
  });
});

describe("VariableReferenceModal template-path context", () => {
  it("renders the journal_link variable in template-path", () => {
    renderModal({ context: "template-path" });
    expect(screen.getByText("{{journal_link(journal_name)}}")).toBeTruthy();
  });

  it("does not render journal_link in name-template", () => {
    renderModal({ context: "name-template" });
    expect(screen.queryByText("{{journal_link(journal_name)}}")).toBeNull();
  });

  it("does not render journal_link in folder-path", () => {
    renderModal({ context: "folder-path" });
    expect(screen.queryByText("{{journal_link(journal_name)}}")).toBeNull();
  });
});

describe("VariableReferenceModal nav-row context", () => {
  it("renders relative_date row when context is nav-row", () => {
    renderModal({ context: "nav-row", hasCycle: true });
    expect(screen.getByText("{{relative_date}}")).toBeTruthy();
    expect(screen.getByText(m.journal_edit_variable_relative_date_description())).toBeTruthy();
  });

  it("renders index row when context is nav-row", () => {
    renderModal({ context: "nav-row", hasCycle: true });
    expect(screen.getByText("{{index}}")).toBeTruthy();
    expect(screen.getByText(m.journal_edit_variable_index_description())).toBeTruthy();
  });

  it("does not render relative_date when context is name-template", () => {
    renderModal({ context: "name-template" });
    expect(screen.queryByText("{{relative_date}}")).toBeNull();
  });

  it("does not render index when context is name-template", () => {
    renderModal({ context: "name-template" });
    expect(screen.queryByText("{{index}}")).toBeNull();
  });
});
