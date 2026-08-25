import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import EditConfigModal from "./EditConfigModal.vue";

const StubConfig = defineComponent({
  props: {
    config: { type: Object, required: true },
    onChange: { type: Function, required: true },
  },
  setup(props) {
    return () =>
      h("div", [
        h("span", (props.config as { label?: string }).label ?? ""),
        h(
          "button",
          { type: "button", onClick: () => (props.onChange as (next: unknown) => void)({ label: "edited" }) },
          "change",
        ),
      ]);
  },
});

describe("EditConfigModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("renders the config component with the current config", () => {
    harness.renderModal(EditConfigModal, { props: { component: StubConfig, config: { label: "original" } } });

    expect(screen.getByText("original")).toBeTruthy();
  });

  it("submits the edited config when Save is clicked", async () => {
    const { submit } = harness.renderModal(EditConfigModal, {
      props: { component: StubConfig, config: { label: "original" } },
    });

    await userEvent.click(screen.getByText("change"));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(submit).toHaveBeenCalledWith({ label: "edited" });
  });

  it("submits the unchanged config when Save is clicked without edits", async () => {
    const { submit } = harness.renderModal(EditConfigModal, {
      props: { component: StubConfig, config: { label: "original" } },
    });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    expect(submit).toHaveBeenCalledWith({ label: "original" });
  });

  it("cancels without submitting when Cancel is clicked", async () => {
    const { submit, cancel } = harness.renderModal(EditConfigModal, {
      props: { component: StubConfig, config: { label: "original" } },
    });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
