import { render } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { useModifierHoverPreview } from "./use-modifier-hover-preview";

function mountHover() {
  const fire = vi.fn();
  let api!: ReturnType<typeof useModifierHoverPreview>;
  const Host = defineComponent({
    setup() {
      api = useModifierHoverPreview();
    },
    template: "<div />",
  });
  const utilities = render(Host);
  return { fire, api, unmount: () => utilities.unmount() };
}

describe("useModifierHoverPreview", () => {
  it("fires immediately when the modifier is held on enter", () => {
    const { fire, api } = mountHover();
    const event = new MouseEvent("mouseenter", { ctrlKey: true });
    api.enter(event, fire);
    expect(fire).toHaveBeenCalledWith(event);
  });

  it("fires when the modifier is pressed while hovering", () => {
    const { fire, api } = mountHover();
    const event = new MouseEvent("mouseenter");
    api.enter(event, fire);
    expect(fire).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    expect(fire).toHaveBeenCalledWith(event);
  });

  it("does not fire for a modifier pressed after the pointer left", () => {
    const { fire, api } = mountHover();
    api.enter(new MouseEvent("mouseenter"), fire);
    api.leave();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta" }));
    expect(fire).not.toHaveBeenCalled();
  });

  it("ignores non-modifier keys while hovering", () => {
    const { fire, api } = mountHover();
    api.enter(new MouseEvent("mouseenter"), fire);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(fire).not.toHaveBeenCalled();
  });

  it("stops listening when the host component unmounts", () => {
    const { fire, api, unmount } = mountHover();
    api.enter(new MouseEvent("mouseenter"), fire);
    unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    expect(fire).not.toHaveBeenCalled();
  });
});
