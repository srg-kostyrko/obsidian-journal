import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import { FALLBACK_VIEW_ICON } from "../config";

import ViewNameModal from "./ViewNameModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentName?: string } = {}) {
  const container = new Container();
  const suggests = new FakeInputSuggestService();
  container.register(InputSuggestService).useValue(suggests as unknown as InputSuggestService);
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ name: string; icon: string }> = { submit, cancel };
  render(ViewNameModal, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel, suggests };
}

function nameInput(): HTMLElement {
  const [input] = screen.getAllByRole("textbox");
  if (!input) throw new Error("the name input is not rendered");
  return input;
}

function iconInput(): HTMLInputElement {
  const [, input] = screen.getAllByRole("textbox");
  if (!input) throw new Error("the icon input is not rendered");
  return input as HTMLInputElement;
}

describe("ViewNameModal", () => {
  it("submits the entered name", async () => {
    const { submit } = mountModal();
    await userEvent.type(nameInput(), "Weekly");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: "Weekly" })));
  });

  it("shows the required-error for an empty name", async () => {
    mountModal();
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.view_name_required_error())).toBeTruthy());
  });

  it("rejects the unchanged name when renaming", async () => {
    mountModal({ currentName: "Weekly" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.view_name_unchanged_error())).toBeTruthy());
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("offers the fallback icon as the initial choice when creating", () => {
    mountModal();
    expect(iconInput().value).toBe(FALLBACK_VIEW_ICON);
  });

  it("submits the icon picked from the suggestions", async () => {
    const { submit, suggests } = mountModal();
    await userEvent.type(nameInput(), "Weekly");
    suggests.handleFor<string>(iconInput()).select("calendar-days");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ name: "Weekly", icon: "calendar-days" }));
  });

  it("omits the icon field when renaming", () => {
    mountModal({ currentName: "Weekly" });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});
