import { render } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import { provideViewContext, useViewContext } from "./view-context";

import type { ViewId } from "./config";
import type { RefDateOrigin, ViewContext } from "./view-context";

function buildContext(overrides: Partial<ViewContext> = {}): ViewContext {
  return {
    viewId: "abc" as ViewId,
    viewName: ref("Calendar"),
    refDate: ref("2026-05-28" as AnchorString),
    refDateOrigin: ref<RefDateOrigin>("navigate"),
    shelf: ref(null),
    preview: false,
    setRefDate: vi.fn(),
    selectRefDate: vi.fn(),
    setShelf: vi.fn(),
    ...overrides,
  };
}

describe("useViewContext", () => {
  it("throws when called outside a provider", () => {
    const Bare = defineComponent({
      template: "<div />",
      setup() {
        useViewContext();
      },
    });
    expect(() => render(Bare)).toThrow();
  });

  it("returns the provided context", () => {
    const context = buildContext();
    let received: ViewContext | null = null;
    const Child = defineComponent({
      template: "<div />",
      setup() {
        received = useViewContext();
      },
    });
    const Parent = defineComponent({
      components: { Child },
      template: "<Child />",
      setup() {
        provideViewContext(context);
      },
    });
    render(Parent);
    expect(received).toBe(context);
  });

  it("setRefDate forwards through the provided context", () => {
    const setRefDate = vi.fn();
    const context = buildContext({ setRefDate });
    const Child = defineComponent({
      template: "<div />",
      setup() {
        useViewContext().setRefDate("2026-06-01" as AnchorString);
      },
    });
    const Parent = defineComponent({
      components: { Child },
      template: "<Child />",
      setup() {
        provideViewContext(context);
      },
    });
    render(Parent);
    expect(setRefDate).toHaveBeenCalledWith("2026-06-01");
  });
});
