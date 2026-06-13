import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import EditToolbarItemModal from "./EditToolbarItemModal.vue";

afterEach(() => cleanup());

const StubConfig = defineComponent({
  props: {
    config: { type: Object, required: true },
    onChange: { type: Function, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("span", String((props.config as { label?: string }).label ?? "")),
        h(
          "button",
          { type: "button", onClick: () => (props.onChange as (next: unknown) => void)({ label: "edited" }) },
          "change",
        ),
      ]);
  },
});

function mountModal(config: Record<string, unknown>) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<Record<string, unknown>> = { submit, cancel };
  render(EditToolbarItemModal, {
    props: { component: StubConfig, config },
    global: { plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }] },
  });
  return { submit, cancel };
}

describe("EditToolbarItemModal", () => {
  it("renders the config component with the current config", () => {
    mountModal({ label: "original" });
    expect(screen.getByText("original")).toBeTruthy();
  });

  it("submits the edited config when Save is clicked", async () => {
    const { submit } = mountModal({ label: "original" });
    await userEvent.click(screen.getByText("change"));
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith({ label: "edited" });
  });

  it("submits the unchanged config when Save is clicked without edits", async () => {
    const { submit } = mountModal({ label: "original" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith({ label: "original" });
  });

  it("cancels without submitting when Cancel is clicked", async () => {
    const { submit, cancel } = mountModal({ label: "original" });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
