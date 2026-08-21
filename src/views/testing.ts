import { render, type RenderResult } from "@testing-library/vue";
import { defineComponent, h, ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import { provideViewContext, type RefDateOrigin, type ViewContext } from "./view-context";

import type { BlockInstanceId, ViewId } from "./config";
import type { ViewBlockDefinition } from "./define-view-block";

export function provideViewContextStub(partial: Partial<ViewContext> = {}): ViewContext {
  return {
    viewId: "stub-view" as ViewId,
    viewName: ref("Stub"),
    refDate: ref("2026-01-01" as AnchorString),
    refDateOrigin: ref<RefDateOrigin>("navigate"),
    shelf: ref(null),
    preview: false,
    setRefDate: () => undefined,
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
