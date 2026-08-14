import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService, TemplaterService } from "@/infrastructure/host";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeTemplaterService } from "@/infrastructure/host/testing";

import { templaterSupportModal } from "./modals";
import TemplaterSupportHint from "./TemplaterSupportHint.vue";

afterEach(() => cleanup());

function build(supported: boolean) {
  const modals = new FakeModalService();
  const templater = new FakeTemplaterService();
  templater.setSupported(supported);
  const container = new Container();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(TemplaterService).useValue(templater as unknown as TemplaterService);
  return { modals, container };
}

function mountHint(container: Container) {
  render(TemplaterSupportHint, {
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
}

describe("TemplaterSupportHint", () => {
  it("renders nothing when Templater is not supported", () => {
    const { container } = build(false);
    mountHint(container);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the support hint link when Templater is supported", () => {
    const { container } = build(true);
    mountHint(container);
    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("opens the caveats modal when the link is clicked", async () => {
    const { modals, container } = build(true);
    mountHint(container);
    await userEvent.click(screen.getByRole("link"));
    expect(modals.lastOpen().definition).toBe(templaterSupportModal);
  });
});
