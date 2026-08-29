import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";

import VariableReferenceModal from "./VariableReferenceModal.vue";

import type { VariableModalContext } from "./variable-context";

describe("VariableReferenceModal — rules table", () => {
  describe.each(["name-template", "folder-path", "template-path"] as const)("%s", (context: VariableModalContext) => {
    it("renders the date variable", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{date}}")).toBeTruthy();
    });

    it("renders the journal_name variable", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{journal_name}}")).toBeTruthy();
    });

    it("renders the week_of_month variable", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{week_of_month}}")).toBeTruthy();
    });

    it("omits start_date and end_date when hasCycle is false", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.queryByText("{{start_date}}")).toBeNull();
      expect(screen.queryByText("{{end_date}}")).toBeNull();
    });

    it("renders start_date and end_date when hasCycle is true", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: true,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{start_date}}")).toBeTruthy();
      expect(screen.getByText("{{end_date}}")).toBeTruthy();
    });

    it("renders one row per numbering variable name", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: ["week_no", "page_no"],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{week_no}}")).toBeTruthy();
      expect(screen.getByText("{{page_no}}")).toBeTruthy();
    });

    it("renders one row per prompt variable, describing it with its question", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [
            { variable: "mood", question: "How do you feel?", type: "text" },
            { variable: "weather", question: "What is the weather like?", type: "select" },
          ],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{mood}}")).toBeTruthy();
      expect(screen.getByText("{{weather}}")).toBeTruthy();
      expect(
        screen.getByText(m.journal_edit_variable_prompt_description({ question: "How do you feel?" })),
      ).toBeTruthy();
      expect(
        screen.getByText(m.journal_edit_variable_prompt_description({ question: "What is the weather like?" })),
      ).toBeTruthy();
    });

    it("renders a modifications link on each numbering row", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: ["week_no", "page_no"],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      const links = screen.getAllByRole("link", { name: /additional modifications/i });
      expect(links.length).toBe(7);
    });

    it("offers date modifications on a date answer and on no other answer type", async () => {
      const openModifications = vi.fn();
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [
            { variable: "due", question: "When is it due?", type: "date" },
            { variable: "mood", question: "How do you feel?", type: "text" },
          ],
          openModifications,
          context,
        },
      });

      // The row is the unit: a date answer binds as a date spec and takes shifts and formats,
      // while a text answer is a bare string that none of them apply to.
      const dateRow = screen.getByText("{{due}}").closest(".variable-reference__row");
      const textRow = screen.getByText("{{mood}}").closest(".variable-reference__row");
      expect(within(dateRow as HTMLElement).getByRole("link", { name: /additional modifications/i })).toBeTruthy();
      expect(within(textRow as HTMLElement).queryByRole("link", { name: /additional modifications/i })).toBeNull();

      await userEvent.click(within(dateRow as HTMLElement).getByRole("link", { name: /additional modifications/i }));
      expect(openModifications).toHaveBeenCalledTimes(1);
    });

    it("renders current_date", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{current_date}}")).toBeTruthy();
    });

    it("renders time", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getAllByText("{{time}}").length).toBeGreaterThanOrEqual(1);
    });

    it("renders current_time", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{current_time}}")).toBeTruthy();
    });
  });

  describe("note name variables", () => {
    // note_name/title are bound after the filename renders, so the name template itself
    // can't use them; folder and template paths can.
    it("omits note_name and title in the name-template context", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context: "name-template",
        },
      });
      expect(screen.queryByText("{{note_name}}")).toBeNull();
      expect(screen.queryByText("{{title}}")).toBeNull();
    });

    it.each(["folder-path", "template-path", "nav-row"] as const)("renders note_name and title in %s", (context) => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context,
        },
      });
      expect(screen.getByText("{{note_name}}")).toBeTruthy();
      expect(screen.getByText("{{title}}")).toBeTruthy();
    });
  });

  describe("non-invertibility warning", () => {
    it("shows the warning on clock vars in name-template", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context: "name-template",
        },
      });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("shows the warning on clock vars in folder-path", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context: "folder-path",
        },
      });
      expect(screen.getAllByText(/recovering the date from the filename/i).length).toBeGreaterThanOrEqual(3);
    });

    it("does NOT show the warning in template-path", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context: "template-path",
        },
      });
      expect(screen.queryByText(/recovering the date from the filename/i)).toBeNull();
    });
  });

  describe("additional-modifications link", () => {
    it("renders a link on every date/clock row", () => {
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications: vi.fn(),
          context: "name-template",
        },
      });
      const links = screen.getAllByRole("link", { name: /additional modifications/i });
      expect(links.length).toBe(5);
    });

    it("invokes openModifications when the link is clicked", async () => {
      const openModifications = vi.fn();
      render(VariableReferenceModal, {
        props: {
          journalName: "daily",
          dateFormat: "YYYY-MM-DD",
          hasCycle: false,
          numberingVariableNames: [],
          promptVariables: [],
          openModifications,
          context: "name-template",
        },
      });
      await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
      expect(openModifications).toHaveBeenCalledTimes(1);
    });
  });
});

describe("VariableReferenceModal yes/no answers", () => {
  const promptVariables = [
    { variable: "done", question: "Done?", type: "toggle" as const },
    { variable: "mood", question: "How do you feel?", type: "text" as const },
  ];

  function renderIn(context: VariableModalContext): void {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: false,
        numberingVariableNames: [],
        promptVariables,
        openModifications: vi.fn(),
        context,
      },
    });
  }

  // A yes/no answer renders a localized "Yes"/"No" that no path pattern matches, so the question
  // editor refuses one in a name or folder. Advertising it in the two path contexts would offer
  // the user a variable that cannot be saved there.
  it.each(["name-template", "folder-path"] as const)("omits a yes/no answer in %s", (context) => {
    renderIn(context);

    expect(screen.queryByText("{{done}}")).toBeNull();
    expect(screen.getByText("{{mood}}")).toBeTruthy();
  });

  // Neither template becomes part of the note's path, so nothing there has to invert.
  it.each(["template-path", "nav-row"] as const)("still lists a yes/no answer in %s", (context) => {
    renderIn(context);

    expect(screen.getByText("{{done}}")).toBeTruthy();
    expect(screen.getByText("{{mood}}")).toBeTruthy();
  });
});

describe("VariableReferenceModal template-path context", () => {
  it("renders the journal_link variable in template-path", () => {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: false,
        numberingVariableNames: [],
        promptVariables: [],
        openModifications: vi.fn(),
        context: "template-path",
      },
    });
    expect(screen.getByText("{{journal_link(journal_name)}}")).toBeTruthy();
  });

  it("does not render journal_link in name-template", () => {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: false,
        numberingVariableNames: [],
        promptVariables: [],
        openModifications: vi.fn(),
        context: "name-template",
      },
    });
    expect(screen.queryByText("{{journal_link(journal_name)}}")).toBeNull();
  });

  it("does not render journal_link in folder-path", () => {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: false,
        numberingVariableNames: [],
        promptVariables: [],
        openModifications: vi.fn(),
        context: "folder-path",
      },
    });
    expect(screen.queryByText("{{journal_link(journal_name)}}")).toBeNull();
  });
});

describe("VariableReferenceModal nav-row context", () => {
  it("renders relative_date row when context is nav-row", () => {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: true,
        numberingVariableNames: [],
        promptVariables: [],
        openModifications: vi.fn(),
        context: "nav-row",
      },
    });
    expect(screen.getByText("{{relative_date}}")).toBeTruthy();
    expect(screen.getByText(m.journal_edit_variable_relative_date_description())).toBeTruthy();
  });

  it("does not render relative_date when context is name-template", () => {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: false,
        numberingVariableNames: [],
        promptVariables: [],
        openModifications: vi.fn(),
        context: "name-template",
      },
    });
    expect(screen.queryByText("{{relative_date}}")).toBeNull();
  });

  it("advertises only the journal's own numbering variables in a nav-row context", () => {
    render(VariableReferenceModal, {
      props: {
        journalName: "daily",
        dateFormat: "YYYY-MM-DD",
        hasCycle: false,
        numberingVariableNames: ["sprint"],
        promptVariables: [],
        openModifications: vi.fn(),
        context: "nav-row",
      },
    });
    expect(screen.getByText("{{sprint}}")).toBeTruthy();
    expect(screen.queryByText("{{index}}")).toBeNull();
  });
});
