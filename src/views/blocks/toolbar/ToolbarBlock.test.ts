import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import type { Module } from "@/infrastructure/di";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";
import { viewsCoreModule } from "@/views/module";

import { defineToolbarItem, type ToolbarItemDefinition } from "../../define-toolbar-item";
import { provideViewContextStub } from "../../testing";
import { ToolbarItemDefinitionToken } from "../../tokens";
import { provideViewContext } from "../../view-context";

import { toolbarBlock } from "./toolbar-block";

import type { BlockInstanceId } from "../../config";

function stubName(config: unknown): string {
  return (config as { name: string }).name;
}

const stubItem = defineToolbarItem<{ name: string }>({
  key: "stub",
  label: () => "Stub",
  schema: v.object({ name: v.string() }),
  defaultConfig: () => ({ name: "" }),
  component: defineComponent({
    props: { instanceId: { type: String, required: true }, config: { type: Object, required: true } },
    setup: (properties) => () =>
      h("div", {
        "data-stub": stubName(properties.config),
        "data-instance-id": properties.instanceId,
      }),
  }),
});

function testItemsModule(item: ToolbarItemDefinition): Module {
  return {
    register(c) {
      c.register(ToolbarItemDefinitionToken).useValue(item);
    },
  };
}

async function mountToolbar(
  items: readonly { id: string; key: string; config: Record<string, unknown> }[],
  extraModules: readonly Module[] = [],
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, ...extraModules],
    data: { views: {} },
  });
  const viewContext = provideViewContextStub();
  const castedItems = items as { id: BlockInstanceId; key: string; config: Record<string, unknown> }[];
  const renderRoot = () =>
    h(toolbarBlock.component, {
      instanceId: "block-1" as BlockInstanceId,
      config: { items: castedItems },
    });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(viewContext);
      return renderRoot;
    },
  });
  return harness.render(Wrapper);
}

describe("ToolbarBlock", () => {
  it("renders one component per registered item with a valid config", async () => {
    const { container } = await mountToolbar([
      { id: "i1", key: "spacer", config: {} },
      { id: "i2", key: "spacer", config: {} },
    ]);
    expect(container.querySelectorAll(".jv-toolbar-spacer").length).toBe(2);
  });

  it("skips items whose key is unregistered", async () => {
    const { container } = await mountToolbar([
      { id: "i1", key: "spacer", config: {} },
      { id: "i2", key: "missing", config: {} },
    ]);
    expect(container.querySelectorAll(".jv-toolbar-spacer").length).toBe(1);
  });

  it("skips items whose config fails schema validation", async () => {
    const { container } = await mountToolbar([
      { id: "i1", key: "spacer", config: {} },
      { id: "i2", key: "period-buttons", config: { week: "nope" } },
    ]);
    expect(container.querySelectorAll(".jv-toolbar-spacer").length).toBe(1);
  });

  it("passes the parsed item config through to the rendered component", async () => {
    const { container } = await mountToolbar(
      [{ id: "i1", key: "stub", config: { name: "hello" } }],
      [testItemsModule(stubItem)],
    );
    const stub = container.querySelector<HTMLElement>("[data-stub]");
    expect(stub?.dataset.stub).toBe("hello");
  });
});
