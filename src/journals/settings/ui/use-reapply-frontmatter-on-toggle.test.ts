import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";

import { NoteConnectionService } from "../../notes/note-connection";
import { fixedJournal } from "../../testing";

import { useReapplyFrontmatterOnToggle } from "./use-reapply-frontmatter-on-toggle";

import type { JournalConfig } from "../../config";

class RecordingConnection {
  readonly reapplied: string[] = [];
  async reapplyAll(name: string): Promise<void> {
    this.reapplied.push(name);
  }
}

function setup(patch: { addStartDate?: boolean; addEndDate?: boolean } = {}) {
  const daily = fixedJournal("Daily", { type: "day" });
  const config = ref<JournalConfig>({ ...daily, frontmatter: { ...daily.frontmatter, ...patch } });
  const recorder = new RecordingConnection();
  const container = new Container();
  container.register(NoteConnectionService).useValue(recorder as unknown as NoteConnectionService);

  const Host = defineComponent({
    setup() {
      useReapplyFrontmatterOnToggle(config);
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

describe("useReapplyFrontmatterOnToggle", () => {
  it("reapplies the journal's note frontmatter when the start-date toggle changes", async () => {
    const { config, recorder } = setup({ addStartDate: false });
    config.value.frontmatter.addStartDate = true;
    await nextTick();
    expect(recorder.reapplied).toEqual(["Daily"]);
  });

  it("reapplies the journal's note frontmatter when the end-date toggle changes", async () => {
    const { config, recorder } = setup({ addEndDate: true });
    config.value.frontmatter.addEndDate = false;
    await nextTick();
    expect(recorder.reapplied).toEqual(["Daily"]);
  });

  it("does nothing when an unrelated field changes", async () => {
    const { config, recorder } = setup();
    config.value.autoCreate = true;
    await nextTick();
    expect(recorder.reapplied).toEqual([]);
  });

  it("does nothing when the watched config switches to another journal", async () => {
    const { config, recorder } = setup({ addStartDate: false });
    const weekly = fixedJournal("Weekly", { type: "week" });
    config.value = { ...weekly, frontmatter: { ...weekly.frontmatter, addStartDate: true } };
    await nextTick();
    expect(recorder.reapplied).toEqual([]);
  });
});
