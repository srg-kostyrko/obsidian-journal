import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { fixedJournal } from "@/journals/testing";

import JournalList from "./JournalList.vue";

describe("JournalList", () => {
  it("shows the empty text when there are no entries", () => {
    render(JournalList, { props: { entries: [], emptyText: "Nothing here" } });
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders a row per journal", () => {
    render(JournalList, {
      props: { entries: [["Journal A", fixedJournal("Journal A", { type: "day" })]], emptyText: "Nothing here" },
    });
    expect(screen.getByText("Journal A")).toBeTruthy();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("emits bulk-add with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", fixedJournal("Journal A", { type: "day" })]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_bulk_add({ name: "Journal A" })));
    expect(emitted()["bulk-add"]).toEqual([["Journal A"]]);
  });

  it("emits edit with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", fixedJournal("Journal A", { type: "day" })]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_edit({ name: "Journal A" })));
    expect(emitted().edit).toEqual([["Journal A"]]);
  });

  it("emits clone with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", fixedJournal("Journal A", { type: "day" })]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_clone({ name: "Journal A" })));
    expect(emitted().clone).toEqual([["Journal A"]]);
  });

  it("emits delete with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", fixedJournal("Journal A", { type: "day" })]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Journal A" })));
    expect(emitted().delete).toEqual([["Journal A"]]);
  });
});
