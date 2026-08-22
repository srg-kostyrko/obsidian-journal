import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";

function props(overrides: {
  context: VariableModalContext;
  hasCycle?: boolean;
  numberingVariableNames?: readonly string[];
  openModifications?: () => void;
}) {
  return {
    journalName: "daily",
    dateFormat: "YYYY-MM-DD",
    hasCycle: false,
    numberingVariableNames: [],
    openModifications: vi.fn(),
    ...overrides,
  };
}

let harness: TestHarness;

beforeEach(async () => {
  harness = await testContainer();
});

describe("VariableReferenceModal — rules table", () => {
  describe.each(["name-template", "folder-path", "template-path"] as const)("%s", (context: VariableModalContext) => {
    it("renders the date variable", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getByText("{{date}}")).toBeTruthy();
    });

    it("renders the journal_name variable", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getByText("{{journal_name}}")).toBeTruthy();
    });

    it("renders the week_of_month variable", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getByText("{{week_of_month}}")).toBeTruthy();
    });

    it("omits start_date and end_date when hasCycle is false", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context, hasCycle: false }) });
      expect(screen.queryByText("{{start_date}}")).toBeNull();
      expect(screen.queryByText("{{end_date}}")).toBeNull();
    });

    it("renders start_date and end_date when hasCycle is true", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context, hasCycle: true }) });
      expect(screen.getByText("{{start_date}}")).toBeTruthy();
      expect(screen.getByText("{{end_date}}")).toBeTruthy();
    });

    it("renders one row per numbering variable name", () => {
      harness.renderModal(VariableReferenceModal, {
        props: props({ context, numberingVariableNames: ["week_no", "page_no"] }),
      });
      expect(screen.getByText("{{week_no}}")).toBeTruthy();
      expect(screen.getByText("{{page_no}}")).toBeTruthy();
    });

    it("renders a modifications link on each numbering row", () => {
      harness.renderModal(VariableReferenceModal, {
        props: props({ context, numberingVariableNames: ["week_no", "page_no"] }),
      });
      const links = screen.getAllByRole("link", { name: /additional modifications/i });
      expect(links.length).toBe(7);
    });

    it("renders current_date", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getByText("{{current_date}}")).toBeTruthy();
    });

    it("renders time", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getAllByText("{{time}}").length).toBeGreaterThanOrEqual(1);
    });

    it("renders current_time", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getByText("{{current_time}}")).toBeTruthy();
    });
  });

  describe("note name variables", () => {
    // note_name/title are bound after the filename renders, so the name template itself
    // can't use them; folder and template paths can.
    it("omits note_name and title in the name-template context", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context: "name-template" }) });
      expect(screen.queryByText("{{note_name}}")).toBeNull();
      expect(screen.queryByText("{{title}}")).toBeNull();
    });

    it.each(["folder-path", "template-path", "nav-row"] as const)("renders note_name and title in %s", (context) => {
      harness.renderModal(VariableReferenceModal, { props: props({ context }) });
      expect(screen.getByText("{{note_name}}")).toBeTruthy();
      expect(screen.getByText("{{title}}")).toBeTruthy();
    });
  });

  describe("non-invertibility warning", () => {
    it("shows the warning on clock vars in name-template", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context: "name-template" }) });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("shows the warning on clock vars in folder-path", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context: "folder-path" }) });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("does NOT show the warning in template-path", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context: "template-path" }) });
      expect(screen.queryByText(/recovering the date from the filename/i)).toBeNull();
    });
  });

  describe("additional-modifications link", () => {
    it("renders a link on every date/clock row", () => {
      harness.renderModal(VariableReferenceModal, { props: props({ context: "name-template" }) });
      const links = screen.getAllByRole("link", { name: /additional modifications/i });
      expect(links.length).toBe(5);
    });

    it("invokes openModifications when the link is clicked", async () => {
      const openModifications = vi.fn();
      harness.renderModal(VariableReferenceModal, { props: props({ context: "name-template", openModifications }) });
      await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
      expect(openModifications).toHaveBeenCalledTimes(1);
    });
  });
});

describe("VariableReferenceModal template-path context", () => {
  it("renders the journal_link variable in template-path", () => {
    harness.renderModal(VariableReferenceModal, { props: props({ context: "template-path" }) });
    expect(screen.getByText("{{journal_link(journal_name)}}")).toBeTruthy();
  });

  it("does not render journal_link in name-template", () => {
    harness.renderModal(VariableReferenceModal, { props: props({ context: "name-template" }) });
    expect(screen.queryByText("{{journal_link(journal_name)}}")).toBeNull();
  });

  it("does not render journal_link in folder-path", () => {
    harness.renderModal(VariableReferenceModal, { props: props({ context: "folder-path" }) });
    expect(screen.queryByText("{{journal_link(journal_name)}}")).toBeNull();
  });
});

describe("VariableReferenceModal nav-row context", () => {
  it("renders relative_date row when context is nav-row", () => {
    harness.renderModal(VariableReferenceModal, { props: props({ context: "nav-row", hasCycle: true }) });
    expect(screen.getByText("{{relative_date}}")).toBeTruthy();
    expect(screen.getByText(m.journal_edit_variable_relative_date_description())).toBeTruthy();
  });

  it("does not render relative_date when context is name-template", () => {
    harness.renderModal(VariableReferenceModal, { props: props({ context: "name-template" }) });
    expect(screen.queryByText("{{relative_date}}")).toBeNull();
  });

  it("advertises only the journal's own numbering variables in a nav-row context", () => {
    harness.renderModal(VariableReferenceModal, {
      props: props({ context: "nav-row", numberingVariableNames: ["sprint"] }),
    });
    expect(screen.getByText("{{sprint}}")).toBeTruthy();
    expect(screen.queryByText("{{index}}")).toBeNull();
  });
});
