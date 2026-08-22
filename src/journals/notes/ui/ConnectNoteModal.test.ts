import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { DayPeriod, type OpenInterval } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";
import { journalsCoreModule } from "../../module";
import { fixedJournal } from "../../testing";

import ConnectNoteModal from "./ConnectNoteModal.vue";

async function pickDate(harness: TestHarness, when: string): Promise<void> {
  await userEvent.click(screen.getByText(m.common_pick_a_date()));
  harness.modals.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date(when)));
  await waitFor(() => {
    expect(screen.queryByText(m.common_pick_a_date())).toBeNull();
  });
}

describe("ConnectNoteModal", () => {
  describe("when the note is already connected to a journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
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

    it("does not render the journal select when the note is connected", () => {
      harness.renderModal(ConnectNoteModal, { props: { path: "Journal/2026-06-01.md" as VaultPath } });

      expect(screen.queryByRole("combobox")).toBeNull();
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
  });
});
