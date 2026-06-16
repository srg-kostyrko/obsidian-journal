import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { AutoCreateService } from "../../notes/auto-create";
import { fixedJournal } from "../../testing";

import { useAutoCreateOnEnable } from "./use-auto-create-on-enable";

import type { JournalConfig } from "../../config";

class RecordingAutoCreate {
  readonly created: string[] = [];
  async createCurrent(name: string): Promise<void> {
    this.created.push(name);
  }
}

function setup(autoCreate: boolean) {
  const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate }));
  const recorder = new RecordingAutoCreate();
  const container = new Container();
  container.register(AutoCreateService).useValue(recorder as unknown as AutoCreateService);

  const Host = defineComponent({
    setup() {
      useAutoCreateOnEnable(config);
    },
    template: "<div />",
  });
  render(Host, {
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
  return { config, recorder };
}

afterEach(() => cleanup());

describe("useAutoCreateOnEnable", () => {
  it("creates the current note when the toggle switches on", async () => {
    const { config, recorder } = setup(false);
    config.value.autoCreate = true;
    await nextTick();
    expect(recorder.created).toEqual(["Daily"]);
  });

  it("does nothing when the toggle switches off", async () => {
    const { config, recorder } = setup(true);
    config.value.autoCreate = false;
    await nextTick();
    expect(recorder.created).toEqual([]);
  });

  it("does nothing when an unrelated field changes", async () => {
    const { config, recorder } = setup(false);
    config.value.confirmCreation = true;
    await nextTick();
    expect(recorder.created).toEqual([]);
  });

  it("does nothing on mount when the toggle is already on", async () => {
    const { recorder } = setup(true);
    await nextTick();
    expect(recorder.created).toEqual([]);
  });
});
