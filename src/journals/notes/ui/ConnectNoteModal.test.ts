import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { DayPeriod, type OpenInterval } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";
import { journalsCoreModule } from "../../module";
import { buildNoteletType, fixedJournal } from "../../testing";

import ConnectNoteModal from "./ConnectNoteModal.vue";

import type { TypeId } from "../../notelets/config";
import type { Prompt } from "../../prompts/config";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

async function pickDate(harness: TestHarness, when: string): Promise<void> {
  const trigger = document.querySelector<HTMLElement>(".date-picker-trigger");
  if (!trigger) throw new Error("date picker trigger not found");
  await userEvent.click(trigger);
  harness.modals.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date(when)));
  await waitFor(() => {
    expect(trigger.textContent).toContain(when);
  });
}

describe("ConnectNoteModal", () => {
  describe("when the note is already connected to a journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            // "abacus" sorts and inserts before "daily", so journalNames[0] !== the connected
            // journal: a pre-selection test that used journalNames[0] as its fallback would fail.
            abacus: fixedJournal("abacus", { type: "day" }),
            daily: fixedJournal("daily", { type: "day" }),
          },
        },
      });
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });
    });

    it("offers Disconnect when the note is already connected", async () => {
      const { submit } = harness.renderModal(ConnectNoteModal, {
        props: { path: "Journal/2026-06-01.md" as VaultPath },
      });

      await userEvent.click(screen.getByText(m.connect_note_modal_disconnect()));

      expect(submit).toHaveBeenCalledWith({ action: "disconnect", journalName: "daily" });
    });

    it("pre-selects the journal the note is connected to", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: "Journal/2026-06-01.md" as VaultPath } });

      expect(screen.getByLabelText<HTMLSelectElement>(m.common_label_journal()).value).toBe("daily");
    });

    it("pre-selects the note's own date", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: "Journal/2026-06-01.md" as VaultPath } });

      expect(screen.queryByText(m.common_pick_a_date())).toBeNull();
    });

    it("still offers Disconnect beside the update button", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: "Journal/2026-06-01.md" as VaultPath } });

      expect(screen.getByText(m.connect_note_modal_disconnect())).toBeTruthy();
      expect(screen.getByText(m.connect_note_modal_update())).toBeTruthy();
    });

    it("re-dates the note to the newly picked period", async () => {
      const { submit } = harness.renderModal(ConnectNoteModal, {
        props: { path: "Journal/2026-06-01.md" as VaultPath },
      });
      await pickDate(harness, "2026-06-05");

      await userEvent.click(screen.getByText(m.connect_note_modal_update()));

      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect", anchor: "2026-06-05" }));
    });
  });

  describe("when the note is already connected as a notelet", () => {
    let harness: TestHarness;
    const NOTELET = "Standups/standup.md" as VaultPath;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
            ),
            // Its own type, distinct from "daily"'s, so switching to it is observable: an
            // incoming journal with no types at all would just hide the kind row.
            abacus: fixedJournal(
              "abacus",
              { type: "day" },
              { notelets: { nt_2: buildNoteletType({ id: "nt_2" as TypeId, name: "Ledger" }) } },
            ),
          },
        },
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: NOTELET,
        typeName: "Standup",
        typeId: "nt_1" as TypeId,
      });
    });

    it("pre-selects the type it is connected as", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: NOTELET } });

      expect(screen.getByLabelText<HTMLSelectElement>(m.connect_note_modal_kind_label()).value).toBe("nt_1");
    });

    it("submits the period note when the kind is changed back", async () => {
      const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: NOTELET } });

      await userEvent.selectOptions(screen.getByLabelText(m.connect_note_modal_kind_label()), "");
      await userEvent.click(screen.getByText(m.connect_note_modal_update()));

      expect(submit.mock.calls[0]?.[0]).not.toHaveProperty("typeId");
    });

    it("keeps its type when only the date changes", async () => {
      const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: NOTELET } });
      await pickDate(harness, "2026-06-05");

      expect(screen.getByLabelText<HTMLSelectElement>(m.connect_note_modal_kind_label()).value).toBe("nt_1");

      await userEvent.click(screen.getByText(m.connect_note_modal_update()));

      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect", typeId: "nt_1" }));
    });

    it("clears the type when the journal is switched", async () => {
      // A stale ref (rather than a DOM read) is what actually reaches the submitted payload: an
      // unmatched <select> value silently renders blank even when the underlying ref still holds
      // the old type id, so the meaningful assertion is on what gets submitted, not on the DOM.
      const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: NOTELET } });

      await userEvent.selectOptions(screen.getByLabelText(m.common_label_journal()), "abacus");
      expect(screen.getByLabelText<HTMLSelectElement>(m.connect_note_modal_kind_label()).value).toBe("");

      await userEvent.click(screen.getByText(m.connect_note_modal_update()));

      expect(submit.mock.calls[0]?.[0]).not.toHaveProperty("typeId");
    });

    // The note is its own occupant only in the period sense; a notelet has none at all.
    it("does not offer to replace anything", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: NOTELET } });

      expect(screen.queryByText(m.connect_note_modal_override_label())).toBeNull();
    });
  });

  describe("when the note is already connected as a numbered notelet", () => {
    let harness: TestHarness;
    const NOTELET = "Standups/Standup 2.md" as VaultPath;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                notelets: {
                  nt_1: buildNoteletType({
                    id: "nt_1" as TypeId,
                    name: "Standup",
                    folder: "Standups",
                    nameTemplate: "Standup {{notelet_index}}",
                  }),
                },
              },
            ),
          },
        },
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: NOTELET,
        typeName: "Standup",
        typeId: "nt_1" as TypeId,
        counter: 2,
      });
    });

    // nextIndex counts this note too, so previewing against it would offer to rename the note
    // to a number connect will not write.
    it("offers no rename when its journal, date and type are all unchanged", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: NOTELET } });

      expect(screen.queryByText(m.connect_note_modal_rename_label())).toBeNull();
    });
  });

  describe("when the note is connected as an orphaned notelet", () => {
    let harness: TestHarness;
    const ORPHAN = "Standups/orphan.md" as VaultPath;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
            ),
          },
        },
      });
      // typeId: null is what the index records once a notelet's stored type name no longer
      // resolves to any configured type — the type itself was renamed away or deleted.
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: ORPHAN,
        typeName: "Retired",
        typeId: null,
      });
    });

    it("falls back to the period option when the connected type no longer resolves", async () => {
      // A DOM read alone can't tell "" from any other value that fails to match a <select>
      // option — the browser blanks the display either way. The submitted payload is what
      // actually carries the seed, so that's the load-bearing assertion here.
      const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: ORPHAN } });

      expect(screen.getByLabelText<HTMLSelectElement>(m.connect_note_modal_kind_label()).value).toBe("");

      await userEvent.click(screen.getByText(m.connect_note_modal_update()));

      expect(submit.mock.calls[0]?.[0]).not.toHaveProperty("typeId");
    });
  });

  describe("when the vault has no journals", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
    });

    it("says so and points at the settings instead of offering a dead form", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

      expect(screen.getByText(m.common_no_journals_yet())).toBeTruthy();
    });

    it("offers no journal select to choose from", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

      expect(screen.queryByRole("combobox")).toBeNull();
    });
  });

  describe("when the note is not connected", () => {
    describe("with a daily journal on defaults", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
        });
      });

      it("shows the note path", () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        expect(screen.getByText("inbox/note.md")).toBeTruthy();
      });

      it("submits a connect command for an unconnected note", async () => {
        const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");
        await userEvent.click(screen.getByRole("button", { name: m.connect_note_modal_connect() }));

        expect(submit).toHaveBeenCalledWith(
          expect.objectContaining({ action: "connect", journalName: "daily", anchor: "2026-06-15" }),
        );
      });

      it("disables Connect until a date is picked", () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        const connect = screen.getByRole("button", { name: m.connect_note_modal_connect() });
        expect((connect as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it("picks whole weeks for a weekly journal", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { weekly: fixedJournal("weekly", { type: "week" }) } },
      });
      harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

      await userEvent.click(screen.getByText(m.common_pick_a_date()));

      expect(harness.modals.lastOpen<{ picking: string }, DayPeriod>().props.picking).toBe("week");
    });

    it("bounds the picker to the journal timeline", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { timeline: { start: anchor("2026-06-01"), end: { kind: "never" } } },
            ),
          },
        },
      });
      harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

      await userEvent.click(screen.getByText(m.common_pick_a_date()));

      const bounds = harness.modals.lastOpen<{ bounds?: OpenInterval }, DayPeriod>().props.bounds;
      expect(bounds?.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-01");
    });

    describe("with the journal restricted to a bounded timeline", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                { timeline: { start: anchor(""), end: { kind: "date", date: anchor("2026-06-01") } } },
              ),
            },
          },
        });
      });

      it("disables Connect when the chosen date is outside the journal timeline", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-09-15");

        const connect = screen.getByRole("button", { name: m.connect_note_modal_connect() });
        expect((connect as HTMLButtonElement).disabled).toBe(true);
      });

      it("explains that the chosen date is outside the journal timeline", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-09-15");

        expect(screen.getByText(m.connect_note_modal_out_of_bounds())).toBeTruthy();
      });
    });

    describe("with the journal filed under a subfolder", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "journals" }) } },
        });
      });

      it("spells out the current and configured folder on the move toggle", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        expect(
          screen.getByText(m.connect_note_modal_move_description({ current: "inbox", configured: "journals" })),
        ).toBeTruthy();
      });

      it("names the vault root as the folder of a root-level note", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        expect(
          screen.getByText(
            m.connect_note_modal_move_description({ current: m.common_vault_root(), configured: "journals" }),
          ),
        ).toBeTruthy();
      });
    });

    describe("with a journal that has a prompt in its name template", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                { folder: "journals", nameTemplate: "{{date}} {{mood}}", prompts: [mood] },
              ),
            },
          },
        });
      });

      it("disables the rename toggle", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        const toggle = screen.getByRole("checkbox", { name: m.connect_note_modal_rename_label() });
        expect(toggle.getAttribute("aria-disabled")).toBe("true");
      });

      it("explains why the rename toggle is disabled", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        expect(screen.getByText(m.connect_note_modal_rename_refused_prompt())).toBeTruthy();
      });

      it("leaves the move toggle enabled", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        const toggle = screen.getByRole("checkbox", { name: m.connect_note_modal_move_label() });
        expect(toggle.getAttribute("aria-disabled")).toBe("false");
      });
    });

    describe("with a journal that has a prompt in its folder template", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                { folder: "journals/{{mood}}", nameTemplate: "{{date}}", prompts: [mood] },
              ),
            },
          },
        });
      });

      it("disables the move toggle", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        const toggle = screen.getByRole("checkbox", { name: m.connect_note_modal_move_label() });
        expect(toggle.getAttribute("aria-disabled")).toBe("true");
      });

      it("explains why the move toggle is disabled", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        expect(screen.getByText(m.connect_note_modal_move_refused_prompt())).toBeTruthy();
      });

      it("leaves the rename toggle enabled", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

        await pickDate(harness, "2026-06-15");

        const toggle = screen.getByRole("checkbox", { name: m.connect_note_modal_rename_label() });
        expect(toggle.getAttribute("aria-disabled")).toBe("false");
      });
    });

    it("names the vault root as the configured folder of a root-level journal", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "" }) } },
      });
      harness.renderModal(ConnectNoteModal, { props: { path: "inbox/note.md" as VaultPath } });

      await pickDate(harness, "2026-06-15");

      expect(
        screen.getByText(
          m.connect_note_modal_move_description({ current: "inbox", configured: m.common_vault_root() }),
        ),
      ).toBeTruthy();
    });

    describe("with a journal that has notelet types", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                {
                  notelets: {
                    nt_1: buildNoteletType({
                      id: "nt_1" as TypeId,
                      name: "Standup",
                      nameTemplate: "Standup {{notelet_index}}",
                    }),
                  },
                },
              ),
            },
          },
        });
      });

      it("offers the journal's types beside the period note", () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });

        const kind = screen.getByLabelText(m.connect_note_modal_kind_label());
        expect(within(kind).getByText(m.connect_note_modal_kind_period())).toBeTruthy();
        expect(within(kind).getByText("Standup")).toBeTruthy();
      });

      it("submits the chosen type", async () => {
        const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });
        await pickDate(harness, "2026-06-01");

        await userEvent.selectOptions(screen.getByLabelText(m.connect_note_modal_kind_label()), "nt_1");
        await userEvent.click(screen.getByText(m.connect_note_modal_connect()));

        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect", typeId: "nt_1" }));
      });

      it("submits no type for the period note", async () => {
        const { submit } = harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });
        await pickDate(harness, "2026-06-01");

        await userEvent.click(screen.getByText(m.connect_note_modal_connect()));

        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ action: "connect" }));
        expect(submit.mock.calls[0]?.[0]).not.toHaveProperty("typeId");
      });

      // Several notelets per anchor is the design, so there is no occupant to replace.
      it("hides the override row for a type even when the date is taken", async () => {
        harness.resolve(JournalsIndex).register({
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path: "Journal/2026-06-01.md" as VaultPath,
        });
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });
        await pickDate(harness, "2026-06-01");

        await userEvent.selectOptions(screen.getByLabelText(m.connect_note_modal_kind_label()), "nt_1");

        expect(screen.queryByText(m.connect_note_modal_override_label())).toBeNull();
      });

      // The index is not Vue-reactive: without the version bridge this preview freezes as of
      // mount, and the note the dialog is open over is exactly the one whose period is still
      // being indexed.
      it("re-previews the number when another notelet lands in the index after mount", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });
        await pickDate(harness, "2026-06-01");
        await userEvent.selectOptions(screen.getByLabelText(m.connect_note_modal_kind_label()), "nt_1");
        expect(
          screen.getByText(m.connect_note_modal_rename_description({ current: "n.md", configured: "Standup 1.md" })),
        ).toBeTruthy();

        harness.resolve(JournalsIndex).register({
          kind: "notelet",
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path: "Standup 1.md" as VaultPath,
          typeName: "Standup",
          typeId: "nt_1" as TypeId,
          counter: 1,
        });

        await waitFor(() => {
          expect(
            screen.getByText(m.connect_note_modal_rename_description({ current: "n.md", configured: "Standup 2.md" })),
          ).toBeTruthy();
        });
      });

      it("describes the rename against the type's name, not the journal's", async () => {
        harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });
        await pickDate(harness, "2026-06-01");

        await userEvent.selectOptions(screen.getByLabelText(m.connect_note_modal_kind_label()), "nt_1");

        expect(
          screen.getByText(m.connect_note_modal_rename_description({ current: "n.md", configured: "Standup 1.md" })),
        ).toBeTruthy();
      });
    });

    it("offers no kind row for a journal with no notelet types", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.renderModal(ConnectNoteModal, { props: { path: "inbox/n.md" as VaultPath } });

      expect(screen.queryByLabelText(m.connect_note_modal_kind_label())).toBeNull();
    });
  });
});
