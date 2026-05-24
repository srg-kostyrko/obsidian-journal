import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteJournalModal from "./DeleteJournalModal.vue";
import { deleteJournalModal } from "./modals";

afterEach(() => cleanup());

function mountModal(journalName: string) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ mode: "keep" }> = { submit, cancel };
  render(DeleteJournalModal, {
    props: { journalName },
    global: {
      plugins: [
        {
          install(app) {
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("deleteJournalModal definition", () => {
  it("titles the modal with the journal name", () => {
    expect(deleteJournalModal.title({ journalName: "daily" })).toBe(m.journal_delete_modal_title({ name: "daily" }));
  });
});

describe("DeleteJournalModal", () => {
  it("submits with mode keep on Delete", async () => {
    const { submit } = mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "keep" });
  });

  it("renders the not-implemented hint", () => {
    mountModal("daily");
    expect(screen.getByText(m.journal_delete_mode_not_implemented_hint())).toBeTruthy();
  });

  it("renders the clear option as disabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "clear" }));
    expect(option.hasAttribute("disabled")).toBe(true);
  });

  it("renders the delete option as disabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "delete" }));
    expect(option.hasAttribute("disabled")).toBe(true);
  });

  it("renders the keep option as enabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "keep" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
