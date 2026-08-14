import userEvent from "@testing-library/user-event";
import { cleanup, render } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";

import UiButtonDropdown from "./UiButtonDropdown.vue";

afterEach(() => cleanup());

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("UiButtonDropdown", () => {
  it("starts with the popout closed", () => {
    const { container } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    expect(container.querySelector(".button-dropdown-popout")).toBeNull();
  });

  it("opens the popout when the trigger is clicked", async () => {
    const { container, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));
    expect(container.querySelector(".button-dropdown-popout")).not.toBeNull();
  });

  it("emits select with the option's value when an option is clicked", async () => {
    const { emitted, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));
    await userEvent.click(getByRole("button", { name: "Beta" }));

    expect(emitted("select")).toEqual([["b"]]);
  });

  it("closes the popout after selecting an option", async () => {
    const { container, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));
    await userEvent.click(getByRole("button", { name: "Alpha" }));

    expect(container.querySelector(".button-dropdown-popout")).toBeNull();
  });

  it("closes the popout when clicking outside, without emitting", async () => {
    const { container, emitted, getByRole } = render(UiButtonDropdown, {
      props: { options: OPTIONS },
      slots: { default: "Open" },
    });
    await userEvent.click(getByRole("button", { name: "Open" }));

    // Appended inside the render container, not onto the document body: cleanup only unmounts what
    // it mounted, so a body-level node would outlive this file and be found by the next one.
    const outside = container.ownerDocument.createElement("button");
    outside.textContent = "Outside";
    container.append(outside);
    await userEvent.click(outside);

    expect(container.querySelector(".button-dropdown-popout")).toBeNull();
    expect(emitted("select")).toBeUndefined();
  });
});
