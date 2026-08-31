import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import TemplatesSection from "./TemplatesSection.vue";

describe("TemplatesSection", () => {
  describe("section heading", () => {
    it("shows the template count in the section flair", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["a.md", "b.md"] }) } },
      });

      harness.render(TemplatesSection, { props: { journalName: "daily" } });

      expect(screen.getByText("2")).toBeTruthy();
    });
  });

  describe("adding a template", () => {
    it("appends an empty entry when Add template is clicked", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: [] }) } },
      });
      harness.render(TemplatesSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByLabelText(m.journal_edit_template_add_button()));

      expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.templates).toEqual([""]);
    });
  });

  describe("removing a template", () => {
    it("removes an entry when its trash button is clicked", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["a.md"] }) } },
      });
      harness.render(TemplatesSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_templates()));
      await userEvent.click(screen.getByLabelText(m.journal_edit_template_remove_tooltip()));

      expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.templates).toEqual([]);
    });
  });

  describe("template path preview", () => {
    it("renders the path preview only when the path contains a variable", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                templates: ["{{date:YYYY}}-template.md", "static-template.md"],
              },
            ),
          },
        },
      });
      harness.render(TemplatesSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_templates()));

      await waitFor(() => {
        expect(screen.getByText("2026-template.md")).toBeTruthy();
      });
    });
  });

  describe("addressing a notelet type", () => {
    const seed = {
      journals: {
        Work: fixedJournal(
          "Work",
          { type: "day" },
          {
            templates: ["journal-template.md"],
            notelets: {
              nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup", templates: [] }),
            },
          },
        ),
      },
    };

    it("adds a template onto the type's list, leaving the journal's untouched", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: seed });
      harness.render(TemplatesSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });

      await userEvent.click(screen.getByLabelText(m.journal_edit_template_add_button()));

      const config = harness.resolve(JournalsRepository).get("Work").getOrUndefined();
      expect(config?.notelets.nt_7f3a?.templates).toEqual([""]);
      expect(config?.templates).toEqual(["journal-template.md"]);
    });

    it("previews a type template through the type's own render context", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            Work: fixedJournal(
              "Work",
              { type: "day" },
              {
                notelets: {
                  nt_7f3a: buildNoteletType({
                    id: "nt_7f3a" as TypeId,
                    name: "Standup",
                    templates: ["Standup {{notelet_index}}.md"],
                  }),
                },
              },
            ),
          },
        },
      });
      harness.render(TemplatesSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_templates()));

      await waitFor(() => {
        expect(screen.getByText("Standup 1.md")).toBeTruthy();
      });
    });

    it("still edits the journal's templates with no type", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: seed });
      harness.render(TemplatesSection, { props: { journalName: "Work" } });

      await userEvent.click(screen.getByLabelText(m.journal_edit_template_add_button()));

      const config = harness.resolve(JournalsRepository).get("Work").getOrUndefined();
      expect(config?.templates).toEqual(["journal-template.md", ""]);
    });
  });
});
