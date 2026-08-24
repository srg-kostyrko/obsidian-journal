import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { buildCommand } from "../testing";

import CommandList from "./CommandList.vue";

describe("CommandList", () => {
  it("shows the empty-state text when there are no entries", () => {
    render(CommandList, { props: { entries: [], emptyText: "nothing here" } });
    expect(screen.getByText("nothing here")).toBeTruthy();
  });

  it("renders a row per command with its name", () => {
    render(CommandList, {
      props: { entries: [["id-1", buildCommand({ name: "Open daily" }), "day"]], emptyText: "x" },
    });
    expect(screen.getByText("Open daily")).toBeTruthy();
  });

  it("emits edit with the command id when the edit button is clicked", async () => {
    const { emitted } = render(CommandList, {
      props: { entries: [["id-1", buildCommand({ name: "Open daily" }), "day"]], emptyText: "x" },
    });
    await userEvent.click(screen.getByLabelText(m.command_edit_tooltip({ name: "Open daily" })));
    expect(emitted().edit).toEqual([["id-1"]]);
  });

  it("emits delete with the command id when the delete button is clicked", async () => {
    const { emitted } = render(CommandList, {
      props: { entries: [["id-1", buildCommand({ name: "Open daily" }), "day"]], emptyText: "x" },
    });
    await userEvent.click(screen.getByLabelText(m.common_delete_name({ name: "Open daily" })));
    expect(emitted().delete).toEqual([["id-1"]]);
  });
});
