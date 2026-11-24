import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { userDateFormat } from "@/calendar";
import { withoutEras } from "@/calendar/testing";
import { m } from "@/i18n";
import { JournalsRepository, type JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import JournalList from "./JournalList.vue";

async function harnessWith(journals: Record<string, JournalConfig>): Promise<TestHarness> {
  return testContainer({ modules: [journalsCoreModule], data: { journals } });
}

function entriesOf(harness: TestHarness): [string, JournalConfig][] {
  return [...harness.resolve(JournalsRepository).find().entries()];
}

describe("JournalList", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await harnessWith({ "Journal A": fixedJournal("Journal A", { type: "day" }) });
  });

  it("shows the empty text when there are no entries", () => {
    harness.render(JournalList, { props: { entries: [], emptyText: "Nothing here" } });
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders a row per journal", () => {
    harness.render(JournalList, { props: { entries: entriesOf(harness), emptyText: "Nothing here" } });
    expect(screen.getByText("Journal A")).toBeTruthy();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("emits bulk-add with the journal name", async () => {
    const { emitted } = harness.render(JournalList, {
      props: { entries: entriesOf(harness), emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_bulk_add({ name: "Journal A" })));
    expect(emitted()["bulk-add"]).toEqual([["Journal A"]]);
  });

  it("emits edit with the journal name", async () => {
    const { emitted } = harness.render(JournalList, {
      props: { entries: entriesOf(harness), emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_edit({ name: "Journal A" })));
    expect(emitted().edit).toEqual([["Journal A"]]);
  });

  it("emits clone with the journal name", async () => {
    const { emitted } = harness.render(JournalList, {
      props: { entries: entriesOf(harness), emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_clone({ name: "Journal A" })));
    expect(emitted().clone).toEqual([["Journal A"]]);
  });

  it("emits delete with the journal name", async () => {
    const { emitted } = harness.render(JournalList, {
      props: { entries: entriesOf(harness), emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Journal A" })));
    expect(emitted().delete).toEqual([["Journal A"]]);
  });

  describe("a journal whose path cannot render", () => {
    it("marks a journal whose date format cannot render and clears the mark when the format changes", async () => {
      const broken = await harnessWith({
        Weekly: fixedJournal("Weekly", { type: "week" }, { dateFormat: userDateFormat("YYYYy-[W]w") }),
        Daily: fixedJournal("Daily", { type: "day" }),
      });

      await withoutEras(async () => {
        broken.render(JournalList, { props: { entries: entriesOf(broken), emptyText: "Nothing here" } });
        expect(screen.getAllByText(m.journal_dashboard_date_format_unrenderable())).toHaveLength(1);

        broken.resolve(JournalsRepository).update("Weekly", { dateFormat: userDateFormat("YYYY-[W]w") });

        await waitFor(() => {
          expect(screen.queryByText(m.journal_dashboard_date_format_unrenderable())).toBeNull();
        });
      });
    });

    it("marks a journal whose name template carries a date pattern that cannot render", async () => {
      const broken = await harnessWith({
        Weekly: fixedJournal("Weekly", { type: "week" }, { nameTemplate: "{{date:YYYYy}}-W{{date:w}}" }),
      });

      withoutEras(() => {
        broken.render(JournalList, { props: { entries: entriesOf(broken), emptyText: "Nothing here" } });

        expect(screen.getAllByText(m.journal_dashboard_date_format_unrenderable())).toHaveLength(1);
      });
    });

    it("marks a journal whose folder carries a date pattern that cannot render", async () => {
      const broken = await harnessWith({
        Daily: fixedJournal("Daily", { type: "day" }, { folder: "Journal/{{date:YYYYy}}" }),
      });

      withoutEras(() => {
        broken.render(JournalList, { props: { entries: entriesOf(broken), emptyText: "Nothing here" } });

        expect(screen.getAllByText(m.journal_dashboard_date_format_unrenderable())).toHaveLength(1);
      });
    });
  });
});
