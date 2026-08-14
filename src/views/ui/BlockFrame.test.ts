import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";

import BlockFrame from "./BlockFrame.vue";

afterEach(() => cleanup());

function mount(props: { icon?: string; label: string; summary?: string; editable: boolean }) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(BlockFrame, { props: { ...props, onEdit, onRemove } });
  return { onEdit, onRemove };
}

describe("BlockFrame", () => {
  it("shows the label", () => {
    mount({ label: "Month calendar", editable: false });
    expect(screen.getByText("Month calendar")).toBeTruthy();
  });

  it("shows the summary when provided", () => {
    mount({ label: "Month calendar", summary: "Week numbers: left", editable: false });
    expect(screen.getByText("Week numbers: left")).toBeTruthy();
  });

  it("offers an edit button when editable", () => {
    mount({ label: "X", editable: true });
    expect(screen.getByLabelText(m.view_block_edit())).toBeTruthy();
  });

  it("hides the edit button when not editable", () => {
    mount({ label: "X", editable: false });
    expect(screen.queryByLabelText(m.view_block_edit())).toBeNull();
  });

  it("emits remove when delete is clicked", async () => {
    const { onRemove } = mount({ label: "X", editable: false });
    await userEvent.click(screen.getByLabelText(m.view_block_remove()));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
