import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { dateModificationsModal } from "@/templates/ui/modals";

import MarkdownTemplateVariablesModal from "./MarkdownTemplateVariablesModal.vue";

afterEach(() => cleanup());

function mount() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  render(MarkdownTemplateVariablesModal, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { modals };
}

describe("MarkdownTemplateVariablesModal", () => {
  it("lists the journal_link variable", () => {
    mount();
    expect(screen.getByText("{{journal_link(name)}}")).toBeTruthy();
  });

  it("opens the date modifications modal from a variable's modifications link", async () => {
    const { modals } = mount();
    await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);
    expect(modals.lastOpen().definition).toBe(dateModificationsModal);
  });
});
