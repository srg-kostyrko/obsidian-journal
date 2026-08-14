import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import { JournalsIndex } from "../../journals-index";

import DeleteJournalModal from "./DeleteJournalModal.vue";
import { deleteJournalModal } from "./modals";

afterEach(() => cleanup());

function mountModal(journalName: string, connected: readonly string[] = []) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ mode: "keep" | "clear" | "delete" }> = { submit, cancel };
  const container = new Container();
  const index = new JournalsIndex();
  for (const [i, path] of connected.entries()) {
    index.register({ journalName, anchor: anchor(`2026-06-0${i + 1}`), path: path as VaultPath });
  }
  container.register(JournalsIndex).useValue(index);
  render(DeleteJournalModal, {
    props: { journalName },
    global: {
      plugins: [
        {
          install(app) {
            provideModalApiOnApp(app, api as ModalApi<unknown>);
            provideInjectorOnApp(app, container);
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
  it("states how many notes the journal has, so the blast radius is not a guess", () => {
    mountModal("daily", ["daily/a.md", "daily/b.md"]);
    expect(screen.getByText(m.journal_delete_connected_count({ count: 2 }))).toBeTruthy();
  });

  it("states plainly when the journal has no notes to lose", () => {
    mountModal("daily");
    expect(screen.getByText(m.journal_delete_connected_count({ count: 0 }))).toBeTruthy();
  });

  it("submits with mode keep by default on Delete", async () => {
    const { submit } = mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "keep" });
  });

  it("submits with the selected mode on Delete", async () => {
    const { submit } = mountModal("daily");
    await userEvent.selectOptions(screen.getByRole("combobox"), "clear");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ mode: "clear" });
  });

  it("renders the clear option as enabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "clear" }));
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("renders the delete option as enabled", () => {
    mountModal("daily");
    const option = screen.getByText(m.journal_delete_mode_option({ mode: "delete" }));
    expect(option.hasAttribute("disabled")).toBe(false);
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
