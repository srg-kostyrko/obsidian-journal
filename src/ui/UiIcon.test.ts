import { render } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { renderIcon } from "@/infrastructure/host";

import UiIcon from "./UiIcon.vue";

vi.mock("@/infrastructure/host", () => ({
  renderIcon: vi.fn(),
}));

const mockRenderIcon = vi.mocked(renderIcon);

function makeSvg(label: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.dataset.label = label;
  return svg;
}

describe("UiIcon", () => {
  it("appends the icon returned by renderIcon on mount", () => {
    const svg = makeSvg("search");
    mockRenderIcon.mockReturnValueOnce(svg);

    const { container } = render(UiIcon, { props: { name: "search" } });

    expect(mockRenderIcon).toHaveBeenCalledWith("search");
    expect(container.querySelector("svg[data-label='search']")).not.toBeNull();
  });

  it("replaces the icon when the name prop changes", async () => {
    mockRenderIcon.mockReturnValueOnce(makeSvg("first")).mockReturnValueOnce(makeSvg("second"));

    const { container, rerender } = render(UiIcon, { props: { name: "first" } });
    expect(container.querySelector("svg[data-label='first']")).not.toBeNull();

    await rerender({ name: "second" });
    await nextTick();

    expect(container.querySelector("svg[data-label='first']")).toBeNull();
    expect(container.querySelector("svg[data-label='second']")).not.toBeNull();
  });

  it("clears the span when the name prop becomes empty", async () => {
    mockRenderIcon.mockReturnValueOnce(makeSvg("present"));

    const { container, rerender } = render(UiIcon, { props: { name: "present" } });
    expect(container.querySelector("svg[data-label='present']")).not.toBeNull();

    await rerender({ name: "" });
    await nextTick();

    expect(container.querySelector("svg")).toBeNull();
  });
});
