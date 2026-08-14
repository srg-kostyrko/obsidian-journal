import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import AddBlockPickerModal from "./AddBlockPickerModal.vue";

import type { ViewBlockDefinition } from "../define-view-block";

afterEach(() => cleanup());

function blockDefinition(key: string, label: string): ViewBlockDefinition {
  return {
    key,
    label: () => label,
    schema: v.object({}),
    defaultConfig: {},
    component: { render: () => null },
  } as unknown as ViewBlockDefinition;
}

function mountModal(definitions: ViewBlockDefinition[]) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(AddBlockPickerModal, {
    props: { definitions },
    global: { plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }] },
  });
  return { submit, cancel };
}

describe("AddBlockPickerModal", () => {
  it("submits the chosen key", async () => {
    const { submit } = mountModal([
      blockDefinition("month-calendar", "Month calendar"),
      blockDefinition("divider", "Divider"),
    ]);
    await userEvent.click(screen.getByRole("button", { name: m.view_add_picker_action({ label: "Divider" }) }));
    expect(submit).toHaveBeenCalledWith("divider");
  });

  it("shows the empty state when no blocks are registered", () => {
    mountModal([]);
    expect(screen.getByText(m.view_add_block_empty())).toBeTruthy();
  });

  it("cancels when the user clicks Close", async () => {
    const { cancel } = mountModal([blockDefinition("divider", "Divider")]);
    await userEvent.click(screen.getByText(m.common_action_close()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
