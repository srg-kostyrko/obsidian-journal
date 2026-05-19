import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import { variableReferenceModal } from "./variable-reference-modal";
import VariableReferenceHint from "./VariableReferenceHint.vue";

afterEach(() => cleanup());

function build() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  return { modals, container };
}

describe("VariableReferenceHint", () => {
  it("opens the variable reference modal when clicked", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: { journalName: "daily", dateFormat: "YYYY-MM-DD", hasNumbering: false },
      global: {
        plugins: [
          {
            install(app) {
              provideInjectorOnApp(app, container);
            },
          },
        ],
      },
    });
    await userEvent.click(screen.getByRole("link"));
    expect(modals.opens.length).toBe(1);
    const lastOpen = modals.lastOpen();
    expect(lastOpen.definition).toBe(variableReferenceModal);
    expect(lastOpen.props).toEqual({ journalName: "daily", dateFormat: "YYYY-MM-DD", hasNumbering: false });
  });
});
