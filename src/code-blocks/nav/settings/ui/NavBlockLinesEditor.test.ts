import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository, type JournalConfig, type NavBlockSegment } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNavSegment, customJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { EditNavBlockSegmentFlow } from "../flows/edit-nav-segment.flow";

import NavBlockLinesEditor from "./NavBlockLinesEditor.vue";

const TITLE = "Interval rows";

function journalWithIntervalLines(lines: NavBlockSegment[][], decorateWholeBlock = false): JournalConfig {
  const base = customJournal("daily", "day", 1, "2026-01-01");
  return { ...base, intervalBlock: { ...base.intervalBlock, lines, decorateWholeBlock } };
}

async function mount(lines: NavBlockSegment[][], decorateWholeBlock = false) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { journals: { daily: journalWithIntervalLines(lines, decorateWholeBlock) } },
  });
  const flows = harness.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  harness.render(NavBlockLinesEditor, {
    props: { journalName: "daily", field: "intervalBlock", title: TITLE, icon: "list" },
  });
  return { harness, flows };
}

const sampleSegment = buildNavSegment({ template: "static text" });

describe("NavBlockLinesEditor", () => {
  it("hides the mode dropdown when mode is not enabled", async () => {
    await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_mode_label())).toBeNull();
  });

  it("hides the use-defaults button when useDefaults is not enabled", async () => {
    await mount([]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_use_defaults({ writeType: "custom" }))).toBeNull();
  });

  it("marks segments as editable so they carry a hover and focus affordance for drag and edit", async () => {
    await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const segment = document.querySelector<HTMLElement>(".nav-block-preview .nav-row");
    expect(segment?.classList.contains("nav-row--editable")).toBe(true);
  });

  it("lets a lone segment fill its line so its background and click target span the block", async () => {
    await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const line = document.querySelector<HTMLElement>(".nav-block-line");
    expect(line?.classList.contains("nav-block-line--multi")).toBe(false);
  });

  it("marks a line holding several segments so they hug their text instead of sharing the width", async () => {
    await mount([[sampleSegment, { ...sampleSegment, template: "second" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const line = document.querySelector<HTMLElement>(".nav-block-line");
    expect(line?.classList.contains("nav-block-line--multi")).toBe(true);
  });

  it("invokes the flow with the intervalBlock field when the header 'add line' button is clicked", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByLabelText(m.block_lines_add_line()));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
    });
  });

  it("invokes the flow with lineIndex when a line's gutter 'add' button is clicked", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    await userEvent.click(within(preview).getByLabelText(m.block_lines_add_segment()));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
    });
  });

  it("invokes the flow with lineIndex and segmentIndex when a segment is clicked", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByText("static text"));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("invokes the flow with lineIndex and segmentIndex when a segment is clicked, with the whole block decorated", async () => {
    // customIntervalBlock's shipped default has decorateWholeBlock: true — the only branch of
    // NavBlock's two render paths this editor drives in production. Cover it explicitly rather
    // than only the decorateWholeBlock: false branch every other test in this file exercises.
    const { flows } = await mount([[sampleSegment]], true);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByText("static text"));
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("shows a placeholder for an empty segment that stays clickable", async () => {
    const emptySegment = { ...sampleSegment, template: "" };
    const { flows } = await mount([[emptySegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const placeholder = screen.getByText("—");
    await userEvent.click(placeholder);
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("uses the segment's own text as the accessible name when it is not empty", async () => {
    await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.getByRole("button", { name: "static text" })).toBeTruthy();
  });

  it("uses the empty-segment message as the accessible name for an empty segment", async () => {
    const emptySegment = { ...sampleSegment, template: "" };
    await mount([[emptySegment]]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.getByRole("button", { name: m.block_lines_empty_segment() })).toBeTruthy();
  });

  it("invokes the flow when Enter is pressed on a focused segment", async () => {
    const { flows } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const segmentEl = screen.getByText("static text");
    segmentEl.focus();
    await userEvent.keyboard("{Enter}");
    expect(flows.invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("removes a line from intervalBlock when its delete button is clicked", async () => {
    const { harness } = await mount([[sampleSegment], [{ ...sampleSegment, template: "other" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const deleteButtons = screen.getAllByLabelText(m.block_lines_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    const journal = harness.resolve(JournalsRepository).get("daily").getOrUndefined();
    expect(journal?.intervalBlock.lines.map((line) => line[0]?.template)).toEqual(["other"]);
  });

  it("renders a leading drop zone above the first line, so a segment can split into a new first line", async () => {
    await mount([[sampleSegment], [{ ...sampleSegment, template: "other" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    const dropZones = [...preview.querySelectorAll<HTMLElement>(".nav-line-drop")];
    expect(dropZones[0]?.dataset.lineIndex).toBe("0");
    // One before every line and one after each, so two lines get three zones: 0, 1, 2.
    expect(dropZones.map((el) => el.dataset.lineIndex)).toEqual(["0", "1", "2"]);
  });

  it("keeps drop zones in layout when idle so revealing them cannot shift the list mid-drag", async () => {
    await mount([[sampleSegment], [{ ...sampleSegment, template: "other" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview");
    const zones = [...(preview?.querySelectorAll<HTMLElement>(".nav-line-drop") ?? [])];
    expect(zones).toHaveLength(3);
    expect(zones.every((el) => el.style.display !== "none")).toBe(true);
    expect(zones.some((el) => el.classList.contains("nav-line-drop--showing"))).toBe(false);
  });

  it("toggles decorateWholeBlock on intervalBlock", async () => {
    const { harness } = await mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByRole("checkbox"));
    const journal = harness.resolve(JournalsRepository).get("daily").getOrUndefined();
    expect(journal?.intervalBlock.decorateWholeBlock).toBe(true);
  });
});
