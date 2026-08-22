import userEvent from "@testing-library/user-event";
import { screen, waitFor, type RenderResult } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { journalsUiModule } from "@/journals/ui-module";
import type { SubpageNav } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { JournalEditSectionToken, defineJournalEditSection } from "./journal-edit-section";
import JournalEditSubpage from "./JournalEditSubpage.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

const noopNav: SubpageNav<{ journalName: string }> = {
  back: () => undefined,
  push: () => undefined,
  replace: () => undefined,
};

describe("JournalEditSubpage", () => {
  describe("with a weekly journal", () => {
    beforeEach(async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule, journalsUiModule],
        data: { journals: { work: fixedJournal("work", { type: "week" }) } },
      });
      harness.render(JournalEditSubpage, { props: { journalName: "work", nav: noopNav } });
    });

    it("renders the journal name", () => {
      expect(screen.getByText("work")).toBeTruthy();
    });

    it("renders the write frequency", () => {
      expect(screen.getByText(m.journal_write({ type: "week", every: "day", duration: 1 }))).toBeTruthy();
    });
  });

  describe("with a daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, journalsUiModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("calls nav.back when the back breadcrumb is clicked", async () => {
      const back = vi.fn();
      harness.render(JournalEditSubpage, {
        props: { journalName: "daily", nav: { back, push: () => undefined, replace: () => undefined } },
      });

      await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));

      expect(back).toHaveBeenCalledTimes(1);
    });

    it("invokes RenameJournalFlow when the rename pencil is clicked", async () => {
      const flows = harness.resolve(Flows);
      vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok(undefined));
      harness.render(JournalEditSubpage, { props: { journalName: "daily", nav: noopNav } });

      await userEvent.click(screen.getByLabelText(m.journal_edit_rename_tooltip()));

      expect(flows.invoke).toHaveBeenCalledWith(RenameJournalFlow, { journalName: "daily" });
    });

    it("calls nav.back when the underlying journal disappears", async () => {
      const back = vi.fn();
      harness.render(JournalEditSubpage, {
        props: { journalName: "daily", nav: { back, push: () => undefined, replace: () => undefined } },
      });

      harness.resolve(JournalsRepository).delete("daily");

      await waitFor(() => {
        expect(back).toHaveBeenCalled();
      });
    });
  });

  describe("when the journal is renamed", () => {
    let harness: TestHarness;
    let back: Mock<() => void>;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule, journalsUiModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      back = vi.fn();
      // The dashboard re-renders the subpage with the frame's replaced props; stand in for it.
      const nav: SubpageNav<{ journalName: string }> = {
        back,
        push: () => undefined,
        replace: (props) => void utilities.rerender(props),
      };
      const utilities: RenderResult = harness.render(JournalEditSubpage, {
        props: { journalName: "daily", nav },
      });
    });

    it("keeps the journal's page open", async () => {
      harness.resolve(JournalsRepository).rename("daily", "diary");

      await nextTick();
      await nextTick();

      expect(back).not.toHaveBeenCalled();
    });

    it("shows the journal's new name", async () => {
      harness.resolve(JournalsRepository).rename("daily", "diary");

      await waitFor(() => expect(screen.getByText("diary")).toBeTruthy());
    });
  });
});

describe("JournalEditSubpage collision warning", () => {
  it("names another journal that resolves to the same note path", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsUiModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "day" }),
        },
      },
    });

    harness.render(JournalEditSubpage, { props: { journalName: "daily", nav: noopNav } });

    expect(screen.getByText(m.journal_edit_colliding_warning({ names: "weekly" }))).toBeTruthy();
  });

  it("stays hidden when no other journal shares the resolved path", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsUiModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "day" }, { folder: "week" }),
        },
      },
    });

    harness.render(JournalEditSubpage, { props: { journalName: "daily", nav: noopNav } });

    expect(screen.queryByText(/resolves to the same note path as/)).toBeNull();
  });

  it("stays hidden when this is the only journal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsUiModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    harness.render(JournalEditSubpage, { props: { journalName: "daily", nav: noopNav } });

    expect(screen.queryByText(/resolves to the same note path as/)).toBeNull();
  });
});

function makeSectionComponent(label: string) {
  return defineComponent({
    props: { journalName: { type: String, default: "" } },
    render() {
      return h("div", label);
    },
  });
}

// Registered in descending order so the ascending render order can only come from the sort.
const outOfOrderSections: Module = {
  register(container) {
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "b", order: 20, component: makeSectionComponent("B") }));
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "a", order: 10, component: makeSectionComponent("A") }));
  },
};

describe("JournalEditSubpage section ordering", () => {
  it("renders registered sections in ascending order", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, journalsUiModule, outOfOrderSections],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    harness.render(JournalEditSubpage, { props: { journalName: "daily", nav: noopNav } });

    const a = screen.getByText("A");
    const b = screen.getByText("B");
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
