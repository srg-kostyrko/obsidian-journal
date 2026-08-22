import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";

import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useReapplyFrontmatterOnToggle } from "./use-reapply-frontmatter-on-toggle";

import type { JournalConfig } from "../../config";

describe("useReapplyFrontmatterOnToggle", () => {
  let harness: TestHarness;
  let reapplyAll: MockInstance<NoteConnectionService["reapplyAll"]>;

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
    reapplyAll = vi.spyOn(harness.resolve(NoteConnectionService), "reapplyAll").mockReturnValue(AsyncResult.ok());
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

    expect(reapplyAll).toHaveBeenCalledWith("Daily");
  });

  it("reapplies the journal's note frontmatter when the end-date toggle changes", async () => {
    const defaults = fixedJournal("Daily", { type: "day" });
    const config = ref<JournalConfig>({ ...defaults, frontmatter: { ...defaults.frontmatter, addEndDate: true } });
    mount(config);

    config.value.frontmatter.addEndDate = false;
    await nextTick();

    expect(reapplyAll).toHaveBeenCalledWith("Daily");
  });

  it("does nothing when an unrelated field changes", async () => {
    const config = ref<JournalConfig>(fixedJournal("Daily", { type: "day" }));
    mount(config);

    config.value.autoCreate = true;
    await nextTick();

    expect(reapplyAll).not.toHaveBeenCalled();
  });

  it("does nothing when the watched config switches to another journal", async () => {
    const defaults = fixedJournal("Daily", { type: "day" });
    const config = ref<JournalConfig>({ ...defaults, frontmatter: { ...defaults.frontmatter, addStartDate: false } });
    mount(config);

    const weekly = fixedJournal("Weekly", { type: "week" });
    config.value = { ...weekly, frontmatter: { ...weekly.frontmatter, addStartDate: true } };
    await nextTick();

    expect(reapplyAll).not.toHaveBeenCalled();
  });
});
