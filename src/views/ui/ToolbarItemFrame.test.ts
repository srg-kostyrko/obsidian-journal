import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";

import { m } from "@/i18n";

import ToolbarItemFrame from "./ToolbarItemFrame.vue";

import type { BlockInstanceId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";

afterEach(() => cleanup());

const itemId = "11111111-1111-1111-1111-aaaaaaaaaaaa" as BlockInstanceId;

const definition = {
  key: "button",
  label: () => "Button",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => h("span", "PREVIEW") },
  configComponent: { render: () => null },
  __brand: "toolbar-item",
} as unknown as ToolbarItemDefinition;

function mount(itemDefinition: ToolbarItemDefinition | undefined) {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  render(ToolbarItemFrame, {
    props: { item: { id: itemId, key: "button", config: {} }, definition: itemDefinition, onEdit, onRemove },
  });
  return { onEdit, onRemove };
}

describe("ToolbarItemFrame", () => {
  it("renders the item's real component as a preview", () => {
    mount(definition);
    expect(screen.getByText("PREVIEW")).toBeTruthy();
  });

  it("emits edit when the edit button is clicked", async () => {
    const { onEdit } = mount(definition);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_edit()));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("emits remove when the delete button is clicked", async () => {
    const { onRemove } = mount(definition);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_remove()));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("falls back to an unknown-key label when the definition is missing", () => {
    mount(undefined);
    expect(screen.getByText(m.view_toolbar_item_unknown_label({ key: "button" }))).toBeTruthy();
  });
});
