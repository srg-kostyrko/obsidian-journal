import { describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import type { Prompt } from "@/journals/prompts/config";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { usePromptAutocreateGuard } from "./use-prompt-autocreate-guard";

import type { JournalConfig } from "../../config";

const moodPrompt: Prompt = {
  variable: "mood",
  question: "How do you feel?",
  type: "text",
  frontmatterKey: "journal-mood",
  required: false,
};

describe("usePromptAutocreateGuard", () => {
  let harness: TestHarness;

  function mount(config: Ref<JournalConfig>): void {
    const Host = defineComponent({
      setup() {
        usePromptAutocreateGuard(config);
      },
      template: "<div />",
    });
    harness.render(Host);
  }

  it("reverts autoCreate and shows a notice when a question reaches the note name", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal(
        "Daily",
        { type: "day" },
        { nameTemplate: "{{date}} {{mood}}", autoCreate: false, prompts: [moodPrompt] },
      ),
    );
    mount(config);

    config.value.autoCreate = true;
    await nextTick();

    expect(config.value.autoCreate).toBe(false);
    expect(harness.notices.messages).toContain(m.journal_prompt_autocreate_conflict());
  });

  it("reverts autoCreate when a question reaches the folder", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal("Daily", { type: "day" }, { folder: "{{mood}}", autoCreate: false, prompts: [moodPrompt] }),
    );
    mount(config);

    config.value.autoCreate = true;
    await nextTick();

    expect(config.value.autoCreate).toBe(false);
  });

  it("leaves autoCreate on when no question reaches the note name or folder", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal("Daily", { type: "day" }, { autoCreate: false, prompts: [moodPrompt] }),
    );
    mount(config);

    config.value.autoCreate = true;
    await nextTick();

    expect(config.value.autoCreate).toBe(true);
    expect(harness.notices.messages).toHaveLength(0);
  });

  it("reverts autoCreate when the name template starts using a question", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal("Daily", { type: "day" }, { autoCreate: true, prompts: [moodPrompt] }),
    );
    mount(config);

    config.value.nameTemplate = "{{date}} {{mood}}";
    await nextTick();

    expect(config.value.autoCreate).toBe(false);
    expect(harness.notices.messages).toContain(m.journal_prompt_autocreate_conflict());
  });

  it("reverts autoCreate when the folder starts using a question", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal("Daily", { type: "day" }, { autoCreate: true, prompts: [moodPrompt] }),
    );
    mount(config);

    config.value.folder = "Journal/{{mood}}";
    await nextTick();

    expect(config.value.autoCreate).toBe(false);
  });

  it("leaves autoCreate on while the name template holds no question", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal("Daily", { type: "day" }, { autoCreate: true, prompts: [moodPrompt] }),
    );
    mount(config);

    config.value.nameTemplate = "{{date}} log";
    await nextTick();

    expect(config.value.autoCreate).toBe(true);
    expect(harness.notices.messages).toHaveLength(0);
  });

  it("does nothing when the toggle switches off", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(
      fixedJournal("Daily", { type: "day" }, { nameTemplate: "{{date}} {{mood}}", autoCreate: true, prompts: [] }),
    );
    mount(config);

    config.value.autoCreate = false;
    await nextTick();

    expect(harness.notices.messages).toHaveLength(0);
  });

  it("does nothing on mount when the toggle is already on", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }, { autoCreate: true, prompts: [] }));
    mount(config);

    await nextTick();

    expect(config.value.autoCreate).toBe(true);
    expect(harness.notices.messages).toHaveLength(0);
  });
});
