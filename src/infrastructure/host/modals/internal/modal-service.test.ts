import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { createFakeHost, type FakeHost } from "../../internal/testing";
import { InternalObsidianAppToken, InternalPluginToken } from "../../internal/tokens";
import { defineModal } from "../define-modal";
import { ModalCancelled } from "../errors";
import { useModal } from "../use-modal";

import { ModalService } from "./modal-service";

function build(): { service: ModalService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(ModalService).useClass(ModalService);
  return { service: c.resolve(ModalService), host };
}

function renderEmpty() {
  return h("div");
}

const submitOnMount = defineComponent({
  props: { value: { type: String, required: true } },
  setup(props) {
    const { submit } = useModal<string>();
    submit(props.value);
    return renderEmpty;
  },
});

const cancelOnMount = defineComponent({
  setup() {
    const { cancel } = useModal();
    cancel();
    return renderEmpty;
  },
});

const cancelThenSubmit = defineComponent({
  setup() {
    const { submit, cancel } = useModal<string>();
    cancel();
    submit("after-cancel");
    return renderEmpty;
  },
});

const submitThenCancel = defineComponent({
  props: { value: { type: String, required: true } },
  setup(props) {
    const { submit, cancel } = useModal<string>();
    submit(props.value);
    cancel();
    return renderEmpty;
  },
});

const buttonModal = defineComponent({
  setup() {
    const { submit, cancel } = useModal<string>();
    return () =>
      h("div", [
        h("button", { onClick: () => submit("ok"), "data-testid": "go" }, "Go"),
        h("button", { onClick: () => cancel(), "data-testid": "no" }, "No"),
      ]);
  },
});

const submitDefinition = defineModal<string>()({
  component: submitOnMount,
  title: ({ value }: { value: string }) => `Submit ${value}`,
});
const cancelDefinition = defineModal()({
  component: cancelOnMount,
  title: () => "Cancel",
});
const buttonDefinition = defineModal<string>()({
  component: buttonModal,
  title: () => "Buttons",
  width: 520,
  cssClass: ["mod-test"],
});

const titledDefinition = defineModal<string>()({
  component: buttonModal,
  title: ({ name }: { name: string }) => `Modal for ${name}`,
});

const cancelThenSubmitDefinition = defineModal<string>()({
  component: cancelThenSubmit,
  title: () => "Cancel then submit",
});

const submitThenCancelDefinition = defineModal<string>()({
  component: submitThenCancel,
  title: ({ value }: { value: string }) => `Submit ${value} then cancel`,
});

describe("ModalService", () => {
  beforeEach(() => {
    obsidianTesting.reset();
    document.body.replaceChildren();
  });

  describe("open", () => {
    it("resolves with Ok(value) when the SFC calls submit()", async () => {
      const { service } = build();
      const result = await service.open(submitDefinition, { value: "x" });
      expectOk(result);
      expect(result.value).toBe("x");
    });

    it("resolves with Err(ModalCancelled) when the SFC calls cancel()", async () => {
      const { service } = build();
      const result = await service.open(cancelDefinition, undefined);
      expectErr(result);
      expect(result.error).toBeInstanceOf(ModalCancelled);
    });

    it("resolves with Err(ModalCancelled) when Obsidian closes the modal externally", async () => {
      const { service } = build();
      const pending = service.open(buttonDefinition, undefined);
      obsidianTesting.lastOpenModal().close();
      const result = await pending;
      expectErr(result);
      expect(result.error).toBeInstanceOf(ModalCancelled);
    });

    it("resolves with Err(ModalCancelled) when the plugin unloads", async () => {
      const { service, host } = build();
      const pending = service.open(buttonDefinition, undefined);
      host.triggerUnload();
      const result = await pending;
      expectErr(result);
      expect(result.error).toBeInstanceOf(ModalCancelled);
    });

    it("ignores submit() called after cancel() within the same tick", async () => {
      const { service } = build();
      const result = await service.open(cancelThenSubmitDefinition, undefined);
      expectErr(result);
      expect(result.error).toBeInstanceOf(ModalCancelled);
    });

    it("ignores cancel() called after submit() within the same tick", async () => {
      const { service } = build();
      const result = await service.open(submitThenCancelDefinition, { value: "first" });
      expectOk(result);
      expect(result.value).toBe("first");
    });

    it("resolves two concurrent opens independently", async () => {
      const { service } = build();
      const first = service.open(submitDefinition, { value: "a" });
      const second = service.open(submitDefinition, { value: "b" });
      const [r1, r2] = await Promise.all([first, second]);
      expectOk(r1);
      expectOk(r2);
      expect(r1.value).toBe("a");
      expect(r2.value).toBe("b");
    });

    it("applies the resolved title to the modal title element", async () => {
      const { service } = build();
      const pending = service.open(titledDefinition, { name: "Daily" });
      expect(obsidianTesting.lastOpenModal().titleEl.textContent).toBe("Modal for Daily");
      await userEvent.click(screen.getByTestId("no"));
      await pending;
    });

    it("applies the resolved width as --dialog-width", async () => {
      const { service } = build();
      const pending = service.open(buttonDefinition, undefined);
      expect(obsidianTesting.lastOpenModal().modalEl.style.getPropertyValue("--dialog-width")).toBe("520px");
      await userEvent.click(screen.getByTestId("no"));
      await pending;
    });

    it("applies cssClass entries to the modal element", async () => {
      const { service } = build();
      const pending = service.open(buttonDefinition, undefined);
      expect(obsidianTesting.lastOpenModal().modalEl.classList.contains("mod-test")).toBe(true);
      await userEvent.click(screen.getByTestId("no"));
      await pending;
    });
  });
});
