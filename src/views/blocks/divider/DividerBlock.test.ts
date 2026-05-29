import { cleanup } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import { mountViewBlock } from "../../testing";

import { dividerBlock } from "./divider-block";

afterEach(() => cleanup());

describe("DividerBlock", () => {
  it("renders a horizontal divider element", () => {
    const { container } = mountViewBlock(dividerBlock, {});
    expect(container.querySelector(".journal-view-divider")).toBeTruthy();
  });
});
