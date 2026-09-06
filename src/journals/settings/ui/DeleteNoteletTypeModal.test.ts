import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";

import DeleteNoteletTypeModal from "./DeleteNoteletTypeModal.vue";
import { deleteNoteletTypeModal } from "./modals";

describe("deleteNoteletTypeModal definition", () => {
  it("titles the modal with the type name", () => {
    expect(deleteNoteletTypeModal.title({ journalName: "daily", typeId: "nt_1", typeName: "Standup" })).toBe(
      m.journal_notelet_delete_modal_title({ name: "Standup" }),
    );
  });
});

describe("DeleteNoteletTypeModal", () => {
  let harness: TestHarness;

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
  });

  function renderIt() {
    return harness.renderModal(DeleteNoteletTypeModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });
  }

  it("states how many notelets of this type exist, so the blast radius is not a guess", () => {
    renderIt();
    expect(screen.getByText(m.journal_notelet_delete_affected_count({ count: 0 }))).toBeTruthy();
  });

  it("counts only this type's notelets, registered after mount so the index bridge is falsifiable", async () => {
    renderIt();
    const index = harness.resolve(JournalsIndex);
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-01"),
      path: "Standup 1.md" as VaultPath,
      typeName: "Standup",
      typeId: "nt_1" as TypeId,
      counter: 1,
    });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-06-02"),
      path: "Recipe 1.md" as VaultPath,
      typeName: "Recipe",
      typeId: "nt_2" as TypeId,
    });

    expect(await screen.findByText(m.journal_notelet_delete_affected_count({ count: 1 }))).toBeTruthy();
  });

  it("submits with mode keep by default on Delete", async () => {
    const { submit } = renderIt();
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "keep" });
  });

  it("submits with the selected mode on Delete", async () => {
    const { submit } = renderIt();
    await userEvent.selectOptions(screen.getByRole("combobox"), "clear");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "clear" });
  });

  it("renders the clear option as enabled", () => {
    renderIt();
    const option = screen.getByText(m.journal_notelet_delete_mode_option({ mode: "clear" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the delete option as enabled", () => {
    renderIt();
    const option = screen.getByText(m.journal_notelet_delete_mode_option({ mode: "delete" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the keep option as enabled", () => {
    renderIt();
    const option = screen.getByText(m.journal_notelet_delete_mode_option({ mode: "keep" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = renderIt();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
