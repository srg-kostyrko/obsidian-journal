import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useCodeBlockPreviewPath } from "./use-code-block-preview-path";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-27T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useCodeBlockPreviewPath", () => {
  let harness: TestHarness;
  let index: JournalsIndex;
  let path: VaultPath;
  let unmount: () => void;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
    });
    index = harness.resolve(JournalsIndex);

    let captured: VaultPath | null = null;
    const Host = defineComponent({
      template: "<div />",
      setup() {
        captured = useCodeBlockPreviewPath("Daily");
      },
    });
    const utilities = harness.render(Host);
    if (captured === null) throw new Error("path not captured");
    path = captured;
    unmount = () => utilities.unmount();
  });

  it("registers a synthetic entry resolvable by the returned path", () => {
    const entry = index.entryByPath(path);
    expect(entry.isSome() && entry.value).toMatchObject({ journalName: "Daily", anchor: "2026-05-27", path });
  });

  it("unregisters the synthetic entry on unmount", () => {
    unmount();
    expect(index.entryByPath(path).isSome()).toBe(false);
  });
});
