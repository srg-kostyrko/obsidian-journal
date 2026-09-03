import { render, type RenderResult } from "@testing-library/vue";
import * as v from "valibot";
import { defineComponent, h, ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import { viewsCollection, type BlockInstanceId, type View, type ViewId } from "./config";
import { defineToolbarItem, type ToolbarItemDefinition } from "./define-toolbar-item";
import { defineViewBlock, type ViewBlockDefinition } from "./define-view-block";
import { provideViewContext, type RefDateOrigin, type ViewContext } from "./view-context";

const StubComponent = defineComponent({ render: () => null });

export function buildView(id: string, overrides: Partial<View> = {}): View {
  return { ...viewsCollection.defaultItem(id), ...overrides };
}

export function buildViewBlockDefinition(
  key: string,
  overrides: Partial<ViewBlockDefinition> = {},
): ViewBlockDefinition {
  return defineViewBlock({
    key,
    label: () => key,
    schema: v.object({}),
    defaultConfig: {},
    component: StubComponent,
    ...overrides,
  });
}

export function buildToolbarItemDefinition(
  key: string,
  overrides: Partial<ToolbarItemDefinition> = {},
): ToolbarItemDefinition {
  return defineToolbarItem({
    key,
    label: () => key,
    schema: v.object({}),
    defaultConfig: () => ({}),
    component: StubComponent,
    ...overrides,
  });
}

export function provideViewContextStub(partial: Partial<ViewContext> = {}): ViewContext {
  return {
    viewId: "stub-view" as ViewId,
    viewName: ref("Stub"),
    refDate: ref("2026-01-01" as AnchorString),
    refDateOrigin: ref<RefDateOrigin>("navigate"),
    followActiveDate: ref(true),
    shelf: ref(null),
    preview: false,
    setRefDate: () => undefined,
    selectRefDate: () => undefined,
    setShelf: () => undefined,
    ...partial,
  };
}

export function mountViewBlock<TConfig>(
  definition: ViewBlockDefinition<TConfig>,
  props: { instanceId?: BlockInstanceId; config?: TConfig },
  context: Partial<ViewContext> = {},
): RenderResult {
  const resolvedContext = provideViewContextStub(context);
  const instanceId = (props.instanceId ?? "stub-block") as BlockInstanceId;
  const config = props.config ?? definition.defaultConfig;
  const castedDefinition = definition as ViewBlockDefinition<unknown>;
  const renderRoot = () => h(castedDefinition.component, { instanceId, config });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(resolvedContext);
      return renderRoot;
    },
  });
  return render(Wrapper);
}
