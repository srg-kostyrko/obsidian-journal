import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";

import CodeBlockReferenceHint from "./CodeBlockReferenceHint.vue";
import { codeBlockReferenceModal } from "./modals";

beforeAll(() => initLocale("en"));
afterEach(() => cleanup());

function build() {
  const modals = new FakeModalService();
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  return { modals, container };
}

describe("CodeBlockReferenceHint", () => {
  it("opens the code-block reference modal with the journal name", async () => {
    const { modals, container } = build();
    render(CodeBlockReferenceHint, {
      props: { journalName: "Daily" },
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
    expect(lastOpen.definition).toBe(codeBlockReferenceModal);
    expect(lastOpen.props).toMatchObject({ journalName: "Daily" });
  });
});
