import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import IntervalBlockSection from "./IntervalBlockSection.vue";

async function mountCustom() {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { j: customJournal("j", "day", 1, "2026-01-01") } },
  });
  harness.render(IntervalBlockSection, { props: { journalName: "j" } });
}

async function mountFixed() {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: { j: fixedJournal("j", { type: "day" }) } },
  });
  harness.render(IntervalBlockSection, { props: { journalName: "j" } });
}

describe("IntervalBlockSection", () => {
  it("renders the interval editor for a custom-write journal", async () => {
    await mountCustom();
    expect(screen.getByText(m.interval_block_section_title())).toBeTruthy();
  });

  it("renders nothing for a fixed-write journal", async () => {
    await mountFixed();
    expect(screen.queryByText(m.interval_block_section_title())).toBeNull();
  });
});
