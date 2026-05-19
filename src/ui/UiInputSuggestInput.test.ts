import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { defineInputSuggest, InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";

import UiInputSuggestInput from "./UiInputSuggestInput.vue";

afterEach(() => cleanup());

function build() {
  const fake = new FakeInputSuggestService();
  const container = new Container();
  container.register(InputSuggestService).useValue(fake as unknown as InputSuggestService);
  return { fake, container };
}

const fruitSuggest = defineInputSuggest<string>({
  fetch: (q) => ["apple", "apricot", "banana"].filter((f) => f.includes(q)),
  render: (item, element) => {
    element.setText(item);
  },
  toValue: (item) => item,
});

describe("UiInputSuggestInput", () => {
  it("attaches the suggester on mount", () => {
    const { fake, container } = build();
    const model = ref("");
    render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    expect(fake.attachments).toHaveLength(1);
  });

  it("writes the selected value back through v-model", () => {
    const { fake, container } = build();
    const model = ref("");
    const { getByRole } = render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    const input = getByRole<HTMLInputElement>("textbox");
    fake.handleFor<string>(input).select("apricot");
    expect(input.value).toBe("apricot");
  });

  it("disposes the suggester on unmount", () => {
    const { fake, container } = build();
    const model = ref("");
    const { unmount } = render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    const handle = fake.attachments[0];
    expect(handle?.isAttached).toBe(true);
    unmount();
    expect(handle?.isAttached).toBe(false);
  });

  it("propagates user typing through v-model", async () => {
    const { container } = build();
    const model = ref("");
    const { getByRole } = render(UiInputSuggestInput, {
      props: {
        modelValue: model.value,
        definition: fruitSuggest,
        "onUpdate:modelValue": (v: string) => (model.value = v),
      },
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
    await userEvent.type(getByRole("textbox"), "ap");
    expect(model.value).toBe("ap");
  });
});
