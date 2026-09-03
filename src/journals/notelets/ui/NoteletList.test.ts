import { fireEvent, screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { initLocale, m } from "@/i18n";
import { WorkspaceService, type VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { testContainer } from "@/testing";

import NoteletList from "./NoteletList.vue";

import type { NoteletListing } from "../listing";

function listing(overrides: Partial<NoteletListing> = {}): NoteletListing {
  return { periods: [], total: 0, qualifyByJournal: false, ...overrides };
}

const oneDay: NoteletListing = listing({
  total: 1,
  periods: [
    {
      key: "2026-08-12|2026-08-12",
      start: "2026-08-12" as AnchorString,
      end: "2026-08-12" as AnchorString,
      kind: "day",
      types: [
        {
          key: "Daily Meeting",
          journalName: "Daily",
          typeName: "Meeting",
          typeId: "nt_meeting",
          notelets: [
            {
              kind: "notelet",
              journalName: "Daily",
              anchor: "2026-08-12" as AnchorString,
              path: "Daily/Standup.md" as VaultPath,
              typeName: "Meeting",
              typeId: "nt_meeting" as TypeId,
            },
          ],
        },
      ],
    },
  ],
});

async function mount(value: NoteletListing) {
  const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
  const result = harness.render(NoteletList, { props: { listing: value } });
  return { harness, result };
}

describe("NoteletList", () => {
  beforeAll(() => initLocale("en"));

  it("shows the empty message when nothing matched", async () => {
    await mount(listing());
    expect(screen.getByText(m.journal_notelet_list_empty())).toBeTruthy();
  });

  it("renders a notelet's file name as its row", async () => {
    await mount(oneDay);
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("omits period headings when a single period is shown", async () => {
    await mount(oneDay);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
    expect(screen.getByText("Standup")).toBeTruthy();
  });

  it("shows period headings when more than one period is shown", async () => {
    const two = listing({
      total: 2,
      periods: [
        ...oneDay.periods,
        {
          ...oneDay.periods[0],
          key: "2026-08-10|2026-08-16",
          start: "2026-08-10" as AnchorString,
          end: "2026-08-16" as AnchorString,
          kind: "week",
        },
      ],
    });
    await mount(two);
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(2);
  });

  it("bares a type name when one journal is visible and qualifies it when several are", async () => {
    await mount(oneDay);
    expect(screen.getByText("Meeting")).toBeTruthy();
    await mount(listing({ ...oneDay, qualifyByJournal: true }));
    expect(screen.getByText(m.journal_notelet_list_type_qualified({ journal: "Daily", type: "Meeting" }))).toBeTruthy();
  });

  it("marks an orphaned type as missing", async () => {
    const orphan = listing({
      total: 1,
      periods: [
        {
          ...oneDay.periods[0],
          types: [{ ...oneDay.periods[0].types[0], typeId: null, typeName: "Gone" }],
        },
      ],
    });
    await mount(orphan);
    expect(screen.getByText(m.journal_notelet_list_unresolved_type({ type: "Gone" }))).toBeTruthy();
  });

  it("opens a row's note, honoring the click's modifiers", async () => {
    const { harness } = await mount(oneDay);
    const workspace = harness.resolve(WorkspaceService);
    const openNote = vi.spyOn(workspace, "openNote").mockReturnValue(AsyncResult.ok(undefined));
    await fireEvent.click(screen.getByText("Standup"), { ctrlKey: true });
    expect(openNote).toHaveBeenCalledWith("Daily/Standup.md", "tab");
  });

  it("opens a row's note in a tab on middle click", async () => {
    const { harness } = await mount(oneDay);
    const workspace = harness.resolve(WorkspaceService);
    const openNote = vi.spyOn(workspace, "openNote").mockReturnValue(AsyncResult.ok(undefined));
    await fireEvent(screen.getByText("Standup"), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(openNote).toHaveBeenCalledWith("Daily/Standup.md", "tab");
  });
});
