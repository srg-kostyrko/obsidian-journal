import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Clock } from "@/calendar";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsEventsToken } from "../tokens";
import { useViewContext } from "../view-context";
import { ViewsViewModel } from "../view-model";

import { provideViewPreviewContext } from "./preview-view-context";

import type { ViewId } from "../config";

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

const Child = defineComponent({
  setup() {
    const context = useViewContext();
    return () =>
      h("div", [
        h("span", { "data-testid": "ref" }, context.refDate.value),
        h("span", { "data-testid": "shelf" }, context.shelf.value ?? "null"),
      ]);
  },
});

const renderChild = () => h(Child);

async function mountConsumer() {
  const raw = {
    version: 5,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: "Work",
        showInRibbon: false,
        blocks: [],
      },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsViewModel).useClass(ViewsViewModel);

  const Consumer = defineComponent({
    setup() {
      provideViewPreviewContext(viewId);
      return renderChild;
    },
  });
  render(Consumer, { global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] } });
}

describe("provideViewPreviewContext", () => {
  it("exposes today as the reference date", async () => {
    await mountConsumer();
    expect(screen.getByTestId("ref").textContent).toBe(Clock.now().format("YYYY-MM-DD"));
  });

  it("exposes the view's default shelf", async () => {
    await mountConsumer();
    expect(screen.getByTestId("shelf").textContent).toBe("Work");
  });
});
