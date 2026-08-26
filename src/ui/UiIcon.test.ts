import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import UiIcon from "./UiIcon.vue";

describe("UiIcon", () => {
  it("appends the icon returned by renderIcon on mount", () => {
    const { container } = render(UiIcon, { props: { name: "search" } });

    expect(container.querySelector("svg[data-icon='search']")).not.toBeNull();
  });

  it("replaces the icon when the name prop changes", async () => {
    const { container, rerender } = render(UiIcon, { props: { name: "first" } });
    expect(container.querySelector("svg[data-icon='first']")).not.toBeNull();

    await rerender({ name: "second" });
    await nextTick();

    expect(container.querySelector("svg[data-icon='first']")).toBeNull();
    expect(container.querySelector("svg[data-icon='second']")).not.toBeNull();
  });

  it("clears the span when the name prop becomes empty", async () => {
    const { container, rerender } = render(UiIcon, { props: { name: "present" } });
    expect(container.querySelector("svg[data-icon='present']")).not.toBeNull();

    await rerender({ name: "" });
    await nextTick();

    expect(container.querySelector("svg")).toBeNull();
  });
});
