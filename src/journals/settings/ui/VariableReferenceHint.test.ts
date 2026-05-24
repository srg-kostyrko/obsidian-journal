import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import { dateModificationsModal, variableReferenceModal } from "./modals";
import VariableReferenceHint from "./VariableReferenceHint.vue";

afterEach(() => cleanup());

function build() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  return { modals, container };
}

const baseProps = {
  context: "name-template" as const,
  journalName: "daily",
  dateFormat: "YYYY-MM-DD",
  hasCycle: false,
  numberingVariableNames: [] as readonly string[],
};

describe("VariableReferenceHint", () => {
  it("opens the variable reference modal with forwarded props", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: baseProps,
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
    expect(lastOpen.props).toMatchObject(baseProps);
  });

  it("supplies an openModifications callback that opens the date modifications modal", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: baseProps,
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
    const { openModifications } = modals.lastOpen<{ openModifications: () => void }, void>().props;
    openModifications();
    expect(modals.lastOpen().definition).toBe(dateModificationsModal);
  });

  it("forwards numberingVariableNames when provided", async () => {
    const { modals, container } = build();
    render(VariableReferenceHint, {
      props: { ...baseProps, numberingVariableNames: ["week_no"] },
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
    expect(modals.lastOpen().props).toMatchObject({ numberingVariableNames: ["week_no"] });
  });
});
