import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { defineInputSuggest } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import UiInputSuggestInput from "./UiInputSuggestInput.vue";

const fruitSuggest = defineInputSuggest<string>({
  fetch: (q) => ["apple", "apricot", "banana"].filter((f) => f.includes(q)),
  render: (item, element) => {
    element.setText(item);
  },
  toValue: (item) => item,
});

describe("UiInputSuggestInput", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("attaches the suggester on mount", () => {
    const model = ref("");
    harness.render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
    });
    expect(harness.inputSuggests.attachments).toHaveLength(1);
  });

  it("writes the selected value back through v-model", () => {
    const model = ref("");
    const { getByRole } = harness.render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
    });
    const input = getByRole<HTMLInputElement>("textbox");
    harness.inputSuggests.handleFor<string>(input).select("apricot");
    expect(input.value).toBe("apricot");
  });

  it("disposes the suggester on unmount", () => {
    const model = ref("");
    const { unmount } = harness.render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
    });
    const handle = harness.inputSuggests.attachments[0];
    expect(handle?.isAttached).toBe(true);
    unmount();
    expect(handle?.isAttached).toBe(false);
  });

  it("propagates user typing through v-model", async () => {
    const model = ref("");
    const { getByRole } = harness.render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
    });
    await userEvent.type(getByRole("textbox"), "ap");
    expect(model.value).toBe("ap");
  });
});
