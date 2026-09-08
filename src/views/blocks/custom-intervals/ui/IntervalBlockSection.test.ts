import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import IntervalBlockSection from "./IntervalBlockSection.vue";

async function mountCustom() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: { j: customJournal("j", "day", 1, "2026-01-01") } },
  });
  harness.render(IntervalBlockSection, { props: { journalName: "j" } });
}

async function mountFixed() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: { j: fixedJournal("j", { type: "day" }) } },
  });
  harness.render(IntervalBlockSection, { props: { journalName: "j" } });
}

describe("IntervalBlockSection", () => {
  it("renders the interval editor for a custom-write journal", async () => {
    await mountCustom();
    expect(screen.getByText(m.interval_block_section_title())).toBeTruthy();
  });

  it("offers no previous-and-next toggle, which only the navigation block has", async () => {
    await mountCustom();
    await userEvent.click(screen.getByText(m.interval_block_section_title()));
    expect(screen.queryByText(m.nav_block_section_adjacent_label())).toBeNull();
  });

  it("renders nothing for a fixed-write journal", async () => {
    await mountFixed();
    expect(screen.queryByText(m.interval_block_section_title())).toBeNull();
  });
});
