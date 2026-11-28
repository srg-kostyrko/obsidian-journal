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

const stub = (id: string) => ({ id, key: "stub", config: { name: id } });
const spacer = (id: string) => ({ id, key: "spacer", config: {} });
const stubsIn = (group: Element) =>
  [...group.querySelectorAll<HTMLElement>("[data-stub]")].map((element) => element.dataset.stub);

async function groupsOf(items: Parameters<typeof mountToolbar>[0]) {
  const { container } = await mountToolbar(items, [testItemsModule(stubItem)]);
  return [...container.querySelectorAll(".jv-toolbar-group")];
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

  it("renders an item with an unreadable field from its repaired config", async () => {
    const { container } = await mountToolbar(
      [{ id: "i1", key: "stub", config: { name: 42 } }],
      [testItemsModule(stubItem)],
    );
    expect(container.querySelector<HTMLElement>("[data-stub]")?.dataset.stub).toBe("");
  });

  it("skips items whose config cannot be repaired", async () => {
    const unrepairable = defineToolbarItem<{ name: string }>({
      ...stubItem,
      schema: v.pipe(
        v.object({ name: v.string() }),
        v.check(() => false),
      ),
    });
    const { container } = await mountToolbar(
      [
        { id: "i1", key: "spacer", config: {} },
        { id: "i2", key: "stub", config: { name: "x" } },
      ],
      [testItemsModule(unrepairable)],
    );
    expect(container.querySelectorAll(".jv-toolbar-spacer").length).toBe(1);
    expect(container.querySelector("[data-stub]")).toBeNull();
  });

  it("passes the parsed item config through to the rendered component", async () => {
    const { container } = await mountToolbar(
      [{ id: "i1", key: "stub", config: { name: "hello" } }],
      [testItemsModule(stubItem)],
    );
    const stub = container.querySelector<HTMLElement>("[data-stub]");
    expect(stub?.dataset.stub).toBe("hello");
  });

  describe("wrap groups", () => {
    it("puts each run of items between spacers in its own group", async () => {
      const groups = await groupsOf([stub("a"), spacer("s1"), stub("b"), stub("c"), spacer("s2"), stub("d")]);
      expect(groups.map(stubsIn)).toEqual([["a"], ["b", "c"], ["d"]]);
    });

    it("keeps a toolbar with no spacers as one group", async () => {
      const groups = await groupsOf([stub("a"), stub("b")]);
      expect(groups.map(stubsIn)).toEqual([["a", "b"]]);
    });

    it("leaves spacers outside the groups, so they still stretch across the toolbar", async () => {
      const { container } = await mountToolbar([stub("a"), spacer("s1"), stub("b")], [testItemsModule(stubItem)]);
      expect(container.querySelector(".journal-view-toolbar > .jv-toolbar-spacer")).not.toBeNull();
    });

    it("creates no empty group for leading or adjacent spacers", async () => {
      const groups = await groupsOf([spacer("s1"), spacer("s2"), stub("a")]);
      expect(groups.map(stubsIn)).toEqual([["a"]]);
    });

    it("marks only a group that follows a spacer", async () => {
      const groups = await groupsOf([stub("a"), spacer("s1"), stub("b")]);
      expect(groups.map((group) => group.classList.contains("is-after-spacer"))).toEqual([false, true]);
    });
  });
});
