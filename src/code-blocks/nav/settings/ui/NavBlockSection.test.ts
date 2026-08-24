import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository, type JournalConfig, type NavBlockSegment } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNavSegment, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { EditNavBlockSegmentFlow } from "../flows/edit-nav-segment.flow";

import NavBlockSection from "./NavBlockSection.vue";

function journalWithNavLines(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = fixedJournal(name, { type: "day" });
  return { ...base, navBlock: { ...base.navBlock, lines } };
}

async function mount(lines: NavBlockSegment[][]) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: { daily: journalWithNavLines("daily", lines) } },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(NavBlockSection, { props: { journalName: "daily" } });
  return { harness, flows };
}

const sampleSegment = buildNavSegment({ template: "static text" });

describe("NavBlockSection", () => {
  it("shows the empty-state message and 'use defaults' button when lines are empty", async () => {
    await mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getByText(m.block_lines_empty())).toBeTruthy();
    expect(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" }))).toBeTruthy();
  });

  it("populates the lines with write-type defaults when 'use defaults' is clicked", async () => {
    const { harness } = await mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" })));
    const journal = harness.resolve(JournalsRepository).get("daily").getOrUndefined();
    expect(journal?.navBlock.lines.length).toBeGreaterThan(0);
  });

  it("invokes the flow with lineIndex and segmentIndex when a segment is clicked", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText("static text"));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "navBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("invokes the flow without indices when the header 'add line' button is clicked", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByLabelText(m.block_lines_add_line()));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, { journalName: "daily", field: "navBlock" });
  });

  it("invokes the flow with only lineIndex when a line's gutter 'add' button is clicked", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    await userEvent.click(within(preview).getByLabelText(m.block_lines_add_segment()));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "navBlock",
      lineIndex: 0,
    });
  });

  it("removes a line when its delete button is clicked", async () => {
    const { harness } = await mount([[sampleSegment], [{ ...sampleSegment, template: "{{date:MM}}" }]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const deleteButtons = screen.getAllByLabelText(m.block_lines_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    const journal = harness.resolve(JournalsRepository).get("daily").getOrUndefined();
    expect(journal?.navBlock.lines.length).toBe(1);
    expect(journal?.navBlock.lines[0]?.[0]?.template).toBe("{{date:MM}}");
  });

  it("swaps a line up when the up button is clicked on the second line", async () => {
    const a = { ...sampleSegment, template: "A" };
    const b = { ...sampleSegment, template: "B" };
    const { harness } = await mount([[a], [b]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const ups = screen.getAllByLabelText(m.common_action_move_up());
    await userEvent.click(ups.at(1)!);
    const journal = harness.resolve(JournalsRepository).get("daily").getOrUndefined();
    expect(journal?.navBlock.lines.map((line) => line[0]?.template)).toEqual(["B", "A"]);
  });

  it("disables the up arrow on the first line", async () => {
    await mount([[{ ...sampleSegment, template: "A" }], [{ ...sampleSegment, template: "B" }]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.common_action_move_up()).map((b) => (b as HTMLButtonElement).disabled)).toEqual([
      true,
      false,
    ]);
  });

  it("disables the down arrow on the last line", async () => {
    await mount([[{ ...sampleSegment, template: "A" }], [{ ...sampleSegment, template: "B" }]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.common_action_move_down()).map((b) => (b as HTMLButtonElement).disabled)).toEqual(
      [false, true],
    );
  });
});
