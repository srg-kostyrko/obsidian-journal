import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, provide } from "vue";

import { ModalContextKey } from "./internal/modal-context";
import { useModal } from "./use-modal";

import type { ModalApi } from "./types";

afterEach(() => cleanup());

function renderDiv() {
  return h("div");
}

function buildInner() {
  return defineComponent({
    setup() {
      const { submit, cancel } = useModal<string>();
      const onSubmit = () => submit("value");
      const onCancel = () => cancel();
      return () =>
        h("div", [
          h("button", { onClick: onSubmit, "data-testid": "submit" }, "Submit"),
          h("button", { onClick: onCancel, "data-testid": "cancel" }, "Cancel"),
        ]);
    },
  });
}

function buildHarness(api: ModalApi<unknown>) {
  const Inner = buildInner();
  const renderRoot = () => h(Inner);
  return defineComponent({
    setup() {
      provide(ModalContextKey, api);
      return renderRoot;
    },
  });
}

const BadModal = defineComponent({
  setup() {
    useModal();
    return renderDiv;
  },
});

describe("useModal", () => {
  it("invokes the provided submit callback with the value", async () => {
    const submit = vi.fn();
    const cancel = vi.fn();
    render(buildHarness({ submit, cancel }));
    await userEvent.click(screen.getByTestId("submit"));
    expect(submit).toHaveBeenCalledWith("value");
  });

  it("invokes the provided cancel callback", async () => {
    const submit = vi.fn();
    const cancel = vi.fn();
    render(buildHarness({ submit, cancel }));
    await userEvent.click(screen.getByTestId("cancel"));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("throws when no modal context is provided", () => {
    expect(() => render(BadModal)).toThrow();
  });
});
