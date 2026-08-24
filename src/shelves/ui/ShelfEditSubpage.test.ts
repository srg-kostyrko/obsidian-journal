import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { AddJournalFlow, CloneJournalFlow, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { fixedJournal } from "@/journals/testing";
import type { SubpageNav } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { EditShelfNameFlow } from "../flows/edit-shelf-name.flow";
import { shelvesCoreModule } from "../module";
import { ShelvesRepository } from "../repository";
import { buildShelf } from "../testing";

import ShelfEditSubpage from "./ShelfEditSubpage.vue";

import type { ShelfConfig } from "../config";

async function setup(options: { journals?: Record<string, JournalConfig>; shelves?: Record<string, ShelfConfig> }) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: options.journals ?? {}, shelves: options.shelves ?? {} },
  });
  return { harness, shelvesRepo: harness.resolve(ShelvesRepository), flows: harness.resolve(Flows) };
}

const noopNav: SubpageNav<{ shelfName: string }> = {
  back: () => undefined,
  push: () => undefined,
  replace: () => undefined,
};

function mount(harness: TestHarness, shelfName: string, nav: SubpageNav<{ shelfName: string }> = noopNav) {
  return harness.render(ShelfEditSubpage, { props: { shelfName, nav } });
}

// The dashboard re-renders the subpage with the frame's replaced props; stand in for it.
function mountFollowingFrame(harness: TestHarness, shelfName: string) {
  const back = vi.fn();
  const utilities = mount(harness, shelfName, {
    back,
    push: () => undefined,
    replace: (props) => void utilities.rerender(props),
  });
  return { back };
}

describe("ShelfEditSubpage", () => {
  it("lists the shelf's member journals", async () => {
    const { harness } = await setup({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { Work: buildShelf("Work", { journals: ["daily"] }) },
    });
    mount(harness, "Work");
    expect(screen.getByLabelText(m.journal_dashboard_edit({ name: "daily" }))).toBeTruthy();
  });

  it("invokes BulkAddFlow when a member journal's bulk-add is clicked", async () => {
    const { harness, flows } = await setup({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { Work: buildShelf("Work", { journals: ["daily"] }) },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok(undefined));
    mount(harness, "Work");
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_bulk_add({ name: "daily" })));
    expect(flows.invoke).toHaveBeenCalledWith(BulkAddFlow, { journalName: "daily" });
  });

  it("invokes CloneJournalFlow when a member journal's clone is clicked", async () => {
    const { harness, flows } = await setup({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { Work: buildShelf("Work", { journals: ["daily"] }) },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ name: "daily copy" }));
    mount(harness, "Work");
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_clone({ name: "daily" })));
    expect(flows.invoke).toHaveBeenCalledWith(CloneJournalFlow, { journalName: "daily" });
  });

  it("invokes EditShelfNameFlow with the shelf name when rename is clicked", async () => {
    const { harness, flows } = await setup({ shelves: { Work: buildShelf("Work") } });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ shelfName: "Work" }));
    mount(harness, "Work");
    await userEvent.click(screen.getByLabelText(m.shelf_rename()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, { shelfName: "Work" });
  });

  it("calls nav.back when the back breadcrumb is clicked", async () => {
    const { harness } = await setup({ shelves: { Work: buildShelf("Work") } });
    const back = vi.fn();
    mount(harness, "Work", { back, push: () => undefined, replace: () => undefined });
    await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));
    expect(back).toHaveBeenCalled();
  });

  it("calls nav.back when the shelf no longer exists", async () => {
    const { harness } = await setup({ shelves: {} });
    const back = vi.fn();
    mount(harness, "Gone", { back, push: () => undefined, replace: () => undefined });
    expect(back).toHaveBeenCalled();
  });

  describe("when the shelf is renamed", () => {
    it("keeps the shelf's page open", async () => {
      const { harness, shelvesRepo } = await setup({ shelves: { Work: buildShelf("Work") } });
      const { back } = mountFollowingFrame(harness, "Work");
      shelvesRepo.rename("Work", "Office");
      await nextTick();
      await nextTick();
      expect(back).not.toHaveBeenCalled();
    });

    it("shows the shelf's new name", async () => {
      const { harness, shelvesRepo } = await setup({ shelves: { Work: buildShelf("Work") } });
      mountFollowingFrame(harness, "Work");
      shelvesRepo.rename("Work", "Office");
      await vi.waitFor(() => expect(screen.getByText("Office")).toBeTruthy());
    });
  });

  it("assigns a newly created journal to the shelf", async () => {
    const { harness, flows, shelvesRepo } = await setup({
      journals: { daily: fixedJournal("daily", { type: "day" }) },
      shelves: { Work: buildShelf("Work") },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ name: "daily" }));
    mount(harness, "Work");
    await userEvent.click(screen.getByLabelText(m.journal_create()));
    await vi.waitFor(() => expect(shelvesRepo.get("Work").getOr(undefined as never)?.journals).toEqual(["daily"]));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });
});
