import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import type { AnchorString } from "@/calendar";
import { initLocale, m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import NoteletsCodeBlock from "./NoteletsCodeBlock.vue";

const DAY = "2026-08-12" as AnchorString;
const HOST = "Daily/2026-08-12.md" as VaultPath;

const daily = fixedJournal(
  "Daily",
  { type: "day" },
  {
    notelets: {
      nt_meeting: buildNoteletType({ id: "nt_meeting" as never, name: "Meeting" }),
      nt_gym: buildNoteletType({ id: "nt_gym" as never, name: "Gym" }),
    },
  },
);

async function mount(options: { path?: VaultPath; types?: string[] } = {}): Promise<TestHarness> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: { Daily: daily }, shelves: {} },
  });
  harness.render(NoteletsCodeBlock, {
    props: { path: options.path ?? HOST, config: { types: options.types ?? [] } },
  });
  return harness;
}

function seedHost(harness: TestHarness): void {
  harness.resolve(JournalsIndex).register({
    journalName: "Daily",
    anchor: DAY,
    path: HOST,
  });
}

function seedNotelet(harness: TestHarness, path: string, typeName: string, typeId: string): void {
  harness.resolve(JournalsIndex).register({
    kind: "notelet",
    journalName: "Daily",
    anchor: DAY,
    path: path as VaultPath,
    typeName,
    typeId: typeId as never,
  });
}

describe("NoteletsCodeBlock", () => {
  beforeAll(() => initLocale("en"));

  it("says so when the host note is not a journal note", async () => {
    await mount({ path: "Inbox/loose.md" as VaultPath });
    expect(screen.getByText(m.code_blocks_notelets_not_connected())).toBeTruthy();
  });

  it("lists the host period's notelets", async () => {
    const harness = await mount();
    seedHost(harness);
    seedNotelet(harness, "Daily/Standup.md", "Meeting", "nt_meeting");
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("lists a notelet's own siblings when the host is itself a notelet", async () => {
    const harness = await mount({ path: "Daily/Standup.md" as VaultPath });
    seedNotelet(harness, "Daily/Standup.md", "Meeting", "nt_meeting");
    seedNotelet(harness, "Daily/Retro.md", "Meeting", "nt_meeting");
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.getByText("Retro")).toBeTruthy();
  });

  it("filters by type name", async () => {
    const harness = await mount({ types: ["Gym"] });
    seedHost(harness);
    seedNotelet(harness, "Daily/Standup.md", "Meeting", "nt_meeting");
    seedNotelet(harness, "Daily/Run.md", "Gym", "nt_gym");
    await nextTick();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.queryByText("Standup")).toBeNull();
  });

  it("filters by type id too", async () => {
    const harness = await mount({ types: ["nt_gym"] });
    seedHost(harness);
    seedNotelet(harness, "Daily/Run.md", "Gym", "nt_gym");
    seedNotelet(harness, "Daily/Standup.md", "Meeting", "nt_meeting");
    await nextTick();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.queryByText("Standup")).toBeNull();
  });

  it("shows nothing for a type name that does not exist", async () => {
    const harness = await mount({ types: ["Nope"] });
    seedHost(harness);
    seedNotelet(harness, "Daily/Standup.md", "Meeting", "nt_meeting");
    await nextTick();
    expect(screen.getByText(m.journal_notelet_list_empty())).toBeTruthy();
    expect(screen.queryByText("Standup")).toBeNull();
  });

  it("recomputes when a notelet is registered after mount", async () => {
    const harness = await mount();
    seedHost(harness);
    await nextTick();
    expect(screen.queryByText("Standup")).toBeNull();
    seedNotelet(harness, "Daily/Standup.md", "Meeting", "nt_meeting");
    await nextTick();
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("offers creation for the host journal's types", async () => {
    const harness = await mount();
    seedHost(harness);
    await nextTick();
    expect(screen.getByLabelText(m.journal_notelet_list_create())).toBeTruthy();
  });
});
