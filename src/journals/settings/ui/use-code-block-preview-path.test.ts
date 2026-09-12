import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { useCodeBlockPreviewPath } from "./use-code-block-preview-path";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-27T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function mountPreviewHost(): Promise<{ index: JournalsIndex; path: VaultPath; unmount: () => void }> {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
  });

  let captured: VaultPath | null = null;
  const Host = defineComponent({
    template: "<div />",
    setup() {
      captured = useCodeBlockPreviewPath("Daily");
    },
  });
  const utilities = harness.render(Host);
  if (captured === null) throw new Error("path not captured");
  return { index: harness.resolve(JournalsIndex), path: captured, unmount: () => utilities.unmount() };
}

describe("useCodeBlockPreviewPath", () => {
  it("registers a synthetic entry resolvable by the returned path", async () => {
    const { index, path } = await mountPreviewHost();

    const entry = index.entryByPath(path);
    expect(entry.isSome() && entry.value).toMatchObject({ journalName: "Daily", anchor: "2026-05-27", path });
  });

  it("unregisters the synthetic entry on unmount", async () => {
    const { index, path, unmount } = await mountPreviewHost();

    unmount();

    expect(index.entryByPath(path).isSome()).toBe(false);
  });
});
