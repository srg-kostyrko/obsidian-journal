import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";
import { testContainer } from "@/testing";

import UiErrorBoundary from "./UiErrorBoundary.vue";

function boundaryAround(child: ReturnType<typeof defineComponent>) {
  return defineComponent({ render: () => h(UiErrorBoundary, null, { default: () => h(child) }) });
}

const healthy = defineComponent({ render: () => h("div", { "data-testid": "child" }, "fine") });

describe("UiErrorBoundary", () => {
  it("renders its slot when nothing throws", async () => {
    const harness = await testContainer();
    harness.render(boundaryAround(healthy));
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("replaces the slot with the failure message when a descendant render throws", async () => {
    const harness = await testContainer();
    const broken = defineComponent({
      render() {
        throw new Error("boom");
      },
    });
    harness.render(boundaryAround(broken));
    await Promise.resolve();
    expect(screen.getByText(m.settings_section_failed({ reason: "boom" }))).toBeTruthy();
  });

  it("captures a setup failure", async () => {
    const harness = await testContainer();
    const broken = defineComponent({
      setup() {
        throw new Error("bad setup");
      },
      render: () => h("div"),
    });
    harness.render(boundaryAround(broken));
    await Promise.resolve();
    expect(screen.getByText(m.settings_section_failed({ reason: "bad setup" }))).toBeTruthy();
  });

  it("reports a thrown non-Error by its string form", async () => {
    const harness = await testContainer();
    const broken = defineComponent({
      render() {
        throw "plain text" as unknown;
      },
    });
    harness.render(boundaryAround(broken));
    await Promise.resolve();
    expect(screen.getByText(m.settings_section_failed({ reason: "plain text" }))).toBeTruthy();
  });

  it("leaves a section standing when an event handler throws, and lets the error through", async () => {
    const harness = await testContainer();
    const handled: unknown[] = [];
    const clickable = defineComponent({
      render: () =>
        h(
          "button",
          {
            "data-testid": "go",
            onClick: () => {
              throw new Error("handler");
            },
          },
          "go",
        ),
    });
    harness.render(boundaryAround(clickable), {
      global: { config: { errorHandler: (error: unknown) => handled.push(error) } },
    });

    await fireEvent.click(screen.getByTestId("go"));

    expect(screen.getByTestId("go")).toBeTruthy();
    expect(screen.queryByText(m.settings_section_failed({ reason: "handler" }))).toBeNull();
    expect(handled).toHaveLength(1);
  });
});
