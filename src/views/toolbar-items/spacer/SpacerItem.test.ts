import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { provideViewContextStub } from "../../testing";
import { provideViewContext } from "../../view-context";

import { spacerItem } from "./spacer-item";

import type { BlockInstanceId } from "../../config";

const renderSpacer = (): ReturnType<typeof h> =>
  h(spacerItem.component, { instanceId: "s-1" as BlockInstanceId, config: {} });

function mountSpacer(preview: boolean) {
  const context = provideViewContextStub({ preview });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderSpacer;
    },
  });
  return render(Wrapper);
}

describe("SpacerItem", () => {
  it("shows a hint in the settings preview", () => {
    const { container } = mountSpacer(true);
    expect(container.querySelector(".jv-spacer-hint")).not.toBeNull();
  });

  it("renders no hint in the live toolbar", () => {
    const { container } = mountSpacer(false);
    expect(container.querySelector(".jv-spacer-hint")).toBeNull();
  });
});
