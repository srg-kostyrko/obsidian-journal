import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { PlaceJournalFlow } from "../flows/place-journal.flow";
import { shelvesCoreModule } from "../module";
import { buildShelf } from "../testing";

import JournalShelfSection from "./JournalShelfSection.vue";

import type { ShelfConfig } from "../config";

async function setup(shelves: Record<string, ShelfConfig> = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { shelves },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { harness, flows };
}

describe("JournalShelfSection", () => {
  it("renders nothing when no shelves exist", async () => {
    const { harness } = await setup({});
    harness.render(JournalShelfSection, { props: { journalName: "daily" } });
    expect(screen.queryByText(m.common_label_shelf())).toBeNull();
  });

  it("shows the not-on-a-shelf message when the journal is unassigned", async () => {
    const { harness } = await setup({ Work: buildShelf("Work") });
    harness.render(JournalShelfSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.common_label_shelf()));
    expect(screen.getByText(m.shelf_section_not_on_shelf())).toBeTruthy();
  });

  it("shows the current shelf when the journal is on one", async () => {
    const { harness } = await setup({ Work: buildShelf("Work", { journals: ["daily"] }) });
    harness.render(JournalShelfSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.common_label_shelf()));
    expect(screen.getByText("Work")).toBeTruthy();
  });

  it("invokes PlaceJournalFlow when the place button is clicked", async () => {
    const { harness, flows } = await setup({ Work: buildShelf("Work") });
    harness.render(JournalShelfSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.common_label_shelf()));
    await userEvent.click(screen.getByLabelText(m.shelf_section_place_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(PlaceJournalFlow, { journalName: "daily" });
  });
});
