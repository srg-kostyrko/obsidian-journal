import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import NoteCreationSection from "./NoteCreationSection.vue";

function configOf(harness: TestHarness) {
  return harness.resolve(JournalsRepository).get("daily").getOrUndefined();
}

describe("NoteCreationSection", () => {
  describe("section heading", () => {
    it("renders all five setting rows", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.getByText(m.journal_edit_section_note_creation())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_name_template_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_folder_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_date_format_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_confirm_creation_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_auto_create_label())).toBeTruthy();
    });
  });

  describe("nameTemplate field", () => {
    it("names the colliding note path when every entry resolves to one note", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "MyNote" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.getByText(/resolve to MyNote\.md/)).toBeTruthy();
    });

    it("shows the move-to-folder recommendation when nameTemplate contains a slash", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "year/{{date}}" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_name_template())).toBeTruthy();
    });

    it("moves the path prefix from nameTemplate to folder when the recommendation is applied", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "year/{{date}}", folder: "" }),
          },
        },
      });
      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() }));

      expect(configOf(harness)?.folder).toBe("year");
      expect(configOf(harness)?.nameTemplate).toBe("{{date}}");
    });

    describe("on the default date template", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
        });
        harness.render(NoteCreationSection, { props: { journalName: "daily" } });
      });

      it("persists edits to the journal config", async () => {
        const input = screen.getByDisplayValue("{{date}}");

        await userEvent.clear(input);
        await userEvent.type(input, "daily-note");

        expect(configOf(harness)?.nameTemplate).toBe("daily-note");
      });

      it("does not warn about collisions for the default date template", () => {
        expect(screen.queryByText(/resolve to/)).toBeNull();
      });

      it("live-renders the note path preview as nameTemplate changes", async () => {
        const input = screen.getByDisplayValue("{{date}}");

        await userEvent.clear(input);
        await userEvent.type(input, "note-prefix");

        await waitFor(() => {
          expect(configOf(harness)?.nameTemplate).toBe("note-prefix");
        });
        await waitFor(() => {
          expect(screen.getByText("note-prefix.md")).toBeTruthy();
        });
      });
    });

    describe("on a template with an unknown variable", () => {
      beforeEach(async () => {
        const harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}}-{{mystery}}" }) },
          },
        });
        harness.render(NoteCreationSection, { props: { journalName: "daily" } });
      });

      it("shows the invertibility warning for non-invertible templates", () => {
        expect(
          screen.getByText(
            m.journal_edit_name_template_invertibility_warning({
              reason: "unknown-variable",
              offending: "mystery",
            }),
          ),
        ).toBeTruthy();
      });

      it("names the offending variable in the invertibility warning", () => {
        expect(screen.getByText(/"mystery"/)).toBeTruthy();
      });

      it("keeps the internal reason code out of the invertibility warning", () => {
        // Asserting against m.*() with the same arguments the component passes cannot catch a
        // message that renders the reason union verbatim — it passes for any message body. This
        // reads the rendered text instead, and stays true through copy edits.
        expect(screen.queryByText(/unknown-variable/)).toBeNull();
      });
    });
  });

  describe("dateFormat field", () => {
    it("persists edits to the journal config", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.render(NoteCreationSection, { props: { journalName: "daily" } });
      const input = screen.getByDisplayValue("YYYY-MM-DD");

      await userEvent.clear(input);
      await userEvent.type(input, "YYYY/MM");

      expect(configOf(harness)?.dateFormat).toBe("YYYY/MM");
    });

    it("shows the move-to-folder recommendation when dateFormat contains a slash", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY/MM/DD" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_date_format())).toBeTruthy();
    });

    it("moves the path prefix from dateFormat to folder when the recommendation is applied", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY/MM/DD", folder: "" }) },
        },
      });
      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() }));

      expect(configOf(harness)?.folder).toBe("{{date:YYYY}}/{{date:MM}}");
      expect(configOf(harness)?.dateFormat).toBe("DD");
    });
  });

  describe("folder field", () => {
    it("warns when the folder's date format uses the wrong week token", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journals/{{date:GGGG-[W]W}}" }) },
        },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.getByText(m.journal_edit_wrong_week_warning())).toBeTruthy();
    });

    it("does not warn for a folder whose date format has no week token", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journals/{{date:YYYY}}" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.queryByText(m.journal_edit_wrong_week_warning())).toBeNull();
    });
  });

  describe("autoCreate field", () => {
    it("shows the confirmation-skip note only when confirmCreation is enabled", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.render(NoteCreationSection, { props: { journalName: "daily" } });
      expect(screen.queryByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeNull();

      harness.resolve(JournalsRepository).update("daily", { confirmCreation: true });

      await waitFor(() => {
        expect(screen.getByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeTruthy();
      });
    });
  });

  describe("weekly date-format hint", () => {
    it("explains the date variable on a weekly journal", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "week" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.getByText(/day inside the week/i)).toBeTruthy();
    });

    it("omits the explanation on a day journal", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });

      harness.render(NoteCreationSection, { props: { journalName: "daily" } });

      expect(screen.queryByText(/day inside the week/i)).toBeNull();
    });
  });
});
