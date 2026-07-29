import { cleanup, render } from "@testing-library/vue";
import * as v from "valibot";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { defineToolbarItem, type ToolbarItemDefinition } from "../../define-toolbar-item";
import { provideViewContextStub } from "../../testing";
import { ToolbarItemDefinitionToken } from "../../tokens";
import { provideViewContext } from "../../view-context";

import { toolbarBlock } from "./toolbar-block";
import { ToolbarItemsService } from "./toolbar-items-service";

import type { BlockInstanceId } from "../../config";

afterEach(() => cleanup());

function stubName(config: unknown): string {
  return (config as { name: string }).name;
}

const stubItem = defineToolbarItem<{ name: string }>({
  key: "stub",
  label: "Stub",
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

const defaultRegistry: readonly ToolbarItemDefinition[] = [stubItem];

function buildContainer(registry: readonly ToolbarItemDefinition[]) {
  const container = new Container();
  container.addModule(createLoggerTestingModule().module);
  for (const item of registry) container.register(ToolbarItemDefinitionToken).useValue(item);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  return container;
}

function mountToolbar(
  items: readonly { id: string; key: string; config: Record<string, unknown> }[],
  registry: readonly ToolbarItemDefinition[] = defaultRegistry,
) {
  const container = buildContainer(registry);
  const viewContext = provideViewContextStub();
  const castedItems = items as { id: BlockInstanceId; key: string; config: Record<string, unknown> }[];
  const Wrapper = defineComponent({
    render() {
      provideViewContext(viewContext);
      return h(toolbarBlock.component, {
        instanceId: "block-1" as BlockInstanceId,
        config: { items: castedItems },
      });
    },
  });
  return render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ToolbarBlock", () => {
  it("renders one component per registered item with a valid config", () => {
    const { container } = mountToolbar([
      { id: "i1", key: "stub", config: { name: "A" } },
      { id: "i2", key: "stub", config: { name: "B" } },
    ]);
    const stubs = container.querySelectorAll("[data-stub]");
    expect(stubs.length).toBe(2);
  });

  it("skips items whose key is unregistered", () => {
    const { container } = mountToolbar([
      { id: "i1", key: "stub", config: { name: "ok" } },
      { id: "i2", key: "missing", config: {} },
    ]);
    expect(container.querySelectorAll("[data-stub]").length).toBe(1);
  });

  it("skips items whose config fails schema validation", () => {
    const { container } = mountToolbar([
      { id: "i1", key: "stub", config: { name: "ok" } },
      { id: "i2", key: "stub", config: { name: 42 } },
    ]);
    expect(container.querySelectorAll("[data-stub]").length).toBe(1);
  });

  it("passes the parsed item config through to the rendered component", () => {
    const { container } = mountToolbar([{ id: "i1", key: "stub", config: { name: "hello" } }]);
    const stub = container.querySelector<HTMLElement>("[data-stub]");
    expect(stub?.dataset.stub).toBe("hello");
  });
});
