import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";

import { journalsCoreModule } from "@/journals/module";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { useReapplyFrontmatterOnToggle } from "./use-reapply-frontmatter-on-toggle";

import type { JournalConfig } from "../../config";

class RecordingConnection {
  readonly reapplied: string[] = [];
  async reapplyAll(name: string): Promise<void> {
    this.reapplied.push(name);
  }
}

describe("useReapplyFrontmatterOnToggle", () => {
  let harness: TestHarness;
  let recorder: RecordingConnection;

  beforeEach(async () => {
    recorder = new RecordingConnection();
    harness = await testContainer({
      modules: [journalsCoreModule],
      overrides: [overrideWith(NoteConnectionService, recorder as unknown as NoteConnectionService)],
    });
  });

  function mount(config: Ref<JournalConfig>): void {
    const Host = defineComponent({
      setup() {
        useReapplyFrontmatterOnToggle(config);
      },
      template: "<div />",
    });
    harness.render(Host);
  }

  it("reapplies the journal's note frontmatter when the start-date toggle changes", async () => {
    const defaults = fixedJournal("Daily", { type: "day" });
    const config = ref<JournalConfig>({ ...defaults, frontmatter: { ...defaults.frontmatter, addStartDate: false } });
    mount(config);

    config.value.frontmatter.addStartDate = true;
    await nextTick();

    expect(recorder.reapplied).toEqual(["Daily"]);
  });

  it("reapplies the journal's note frontmatter when the end-date toggle changes", async () => {
    const defaults = fixedJournal("Daily", { type: "day" });
    const config = ref<JournalConfig>({ ...defaults, frontmatter: { ...defaults.frontmatter, addEndDate: true } });
    mount(config);

    config.value.frontmatter.addEndDate = false;
    await nextTick();

    expect(recorder.reapplied).toEqual(["Daily"]);
  });

  it("does nothing when an unrelated field changes", async () => {
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }));
    mount(config);

    config.value.autoCreate = true;
    await nextTick();

    expect(recorder.reapplied).toEqual([]);
  });

  it("does nothing when the watched config switches to another journal", async () => {
    const defaults = fixedJournal("Daily", { type: "day" });
    const config = ref<JournalConfig>({ ...defaults, frontmatter: { ...defaults.frontmatter, addStartDate: false } });
    mount(config);

    const weekly = fixedJournal("Weekly", { type: "week" });
    config.value = { ...weekly, frontmatter: { ...weekly.frontmatter, addStartDate: true } };
    await nextTick();

    expect(recorder.reapplied).toEqual([]);
  });
});
