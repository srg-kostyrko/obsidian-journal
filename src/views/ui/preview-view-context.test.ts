import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Clock } from "@/calendar";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { viewsCoreModule } from "../module";
import { buildView } from "../testing";
import { useViewContext } from "../view-context";

import { provideViewPreviewContext } from "./preview-view-context";

import type { ViewId } from "../config";

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;

const Child = defineComponent({
  setup() {
    const context = useViewContext();
    return () =>
      h("div", [
        h("span", { "data-testid": "ref" }, context.refDate.value),
        h("span", { "data-testid": "shelf" }, context.shelf.value ?? "null"),
        h("span", { "data-testid": "follow" }, String(context.followActiveDate.value)),
      ]);
  },
});

const renderChild = () => h(Child);

async function mountConsumer() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views: { [viewId]: buildView(viewId, { name: "Weekly", defaultShelf: "Work" }) } },
  });
  const Consumer = defineComponent({
    setup() {
      provideViewPreviewContext(viewId);
      return renderChild;
    },
  });
  harness.render(Consumer);
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

  it("exposes follow-active-date as on, since the preview is inert", async () => {
    await mountConsumer();
    expect(screen.getByTestId("follow").textContent).toBe("true");
  });
});
