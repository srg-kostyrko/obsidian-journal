import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";

import { journalsCoreModule } from "@/journals/module";
import { AutoCreateService } from "@/journals/notes/auto-create";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useAutoCreateOnEnable } from "./use-auto-create-on-enable";

import type { JournalConfig } from "../../config";

describe("useAutoCreateOnEnable", () => {
  let harness: TestHarness;
  let createCurrent: MockInstance<AutoCreateService["createCurrent"]>;

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    createCurrent = vi.spyOn(harness.resolve(AutoCreateService), "createCurrent").mockResolvedValue(undefined);
  });

  function mount(config: Ref<JournalConfig>): void {
    const Host = defineComponent({
      setup() {
        useAutoCreateOnEnable(config);
      },
      template: "<div />",
    });
    harness.render(Host);
  }

  it("creates the current note when the toggle switches on", async () => {
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate: false }));
    mount(config);

    config.value.autoCreate = true;
    await nextTick();

    expect(createCurrent).toHaveBeenCalledWith("Daily");
  });

  it("does nothing when the toggle switches off", async () => {
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate: true }));
    mount(config);

    config.value.autoCreate = false;
    await nextTick();

    expect(createCurrent).not.toHaveBeenCalled();
  });

  it("does nothing when an unrelated field changes", async () => {
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate: false }));
    mount(config);

    config.value.confirmCreation = true;
    await nextTick();

    expect(createCurrent).not.toHaveBeenCalled();
  });

  it("does nothing on mount when the toggle is already on", async () => {
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate: true }));
    mount(config);

    await nextTick();

    expect(createCurrent).not.toHaveBeenCalled();
  });
});
