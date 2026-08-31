import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";

import DeleteJournalModal from "./DeleteJournalModal.vue";
import { deleteJournalModal } from "./modals";

describe("deleteJournalModal definition", () => {
  it("titles the modal with the journal name", () => {
    expect(deleteJournalModal.title({ journalName: "daily" })).toBe(m.journal_delete_modal_title({ name: "daily" }));
  });
});

describe("DeleteJournalModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
  });

  it("states how many notes the journal has, so the blast radius is not a guess", () => {
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "daily/a.md" as VaultPath });
    index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: "daily/b.md" as VaultPath });
    harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    expect(screen.getByText(m.journal_delete_connected_count({ count: 2 }))).toBeTruthy();
  });

  it("counts notelets among the journal's connected notes", async () => {
    harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: "daily/a.md" as VaultPath });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: "daily/Standup 1.md" as VaultPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
      counter: 1,
    });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: "daily/Standup 2.md" as VaultPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
      counter: 2,
    });

    expect(await screen.findByText(m.journal_delete_connected_count({ count: 3 }))).toBeTruthy();
  });

  it("states plainly when the journal has no notes to lose", () => {
    harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    expect(screen.getByText(m.journal_delete_connected_count({ count: 0 }))).toBeTruthy();
  });

  it("submits with mode keep by default on Delete", async () => {
    const { submit } = harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "keep" });
  });

  it("submits with the selected mode on Delete", async () => {
    const { submit } = harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    await userEvent.selectOptions(screen.getByRole("combobox"), "clear");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "clear" });
  });

  it("renders the clear option as enabled", () => {
    harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "clear" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the delete option as enabled", () => {
    harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "delete" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the keep option as enabled", () => {
    harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "keep" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(DeleteJournalModal, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
