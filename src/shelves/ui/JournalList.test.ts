import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { JournalConfig } from "@/journals";

import JournalList from "./JournalList.vue";

afterEach(() => cleanup());

function makeJournal(name: string): JournalConfig {
  return {
    name,
    write: { type: "day" },
    timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: {
      enabled: false,
      anchorDate: "2024-01-01" as AnchorString,
      allowBefore: false,
      sources: [],
    },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    decorations: [],
    autoCreate: false,
    navBlock: { type: "create", rows: [], decorateWholeBlock: false },
    intervalBlock: { type: "create", rows: [], decorateWholeBlock: false },
  };
}

describe("JournalList", () => {
  it("shows the empty text when there are no entries", () => {
    render(JournalList, { props: { entries: [], emptyText: "Nothing here" } });
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders a row per journal", () => {
    render(JournalList, {
      props: { entries: [["Journal A", makeJournal("Journal A")]], emptyText: "Nothing here" },
    });
    expect(screen.getByText("Journal A")).toBeTruthy();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("emits bulk-add with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", makeJournal("Journal A")]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_bulk_add({ name: "Journal A" })));
    expect(emitted()["bulk-add"]).toEqual([["Journal A"]]);
  });

  it("emits edit with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", makeJournal("Journal A")]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_edit({ name: "Journal A" })));
    expect(emitted().edit).toEqual([["Journal A"]]);
  });

  it("emits delete with the journal name", async () => {
    const { emitted } = render(JournalList, {
      props: { entries: [["Journal A", makeJournal("Journal A")]], emptyText: "Nothing here" },
    });
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Journal A" })));
    expect(emitted().delete).toEqual([["Journal A"]]);
  });
});
