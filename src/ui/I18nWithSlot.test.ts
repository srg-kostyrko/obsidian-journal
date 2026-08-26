import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { h } from "vue";

import I18nWithSlot from "./I18nWithSlot.vue";

function surroundMessage(arguments_: { slot: string }): string {
  return `before ${arguments_.slot} after`;
}

function prefixMessage(arguments_: { slot: string }): string {
  return `${arguments_.slot} comes first`;
}

function noPlaceholderMessage(_arguments: { slot: string }): string {
  return "no slot here";
}

describe("I18nWithSlot", () => {
  it("interpolates the default slot at the {slot} placeholder", () => {
    render(I18nWithSlot, {
      props: { message: surroundMessage },
      slots: { default: () => h("strong", "INSERTED") },
    });
    expect(screen.getByText(/before/i)).toBeTruthy();
    expect(screen.getByText("INSERTED")).toBeTruthy();
    expect(screen.getByText(/after/i)).toBeTruthy();
  });

  it("preserves prose order when the slot is at the start of the message", () => {
    render(I18nWithSlot, {
      props: { message: prefixMessage },
      slots: { default: () => h("em", "X") },
    });
    const container = screen.getByText("X").parentElement;
    expect(container?.textContent).toBe("X comes first");
  });

  it("renders the message unchanged when no slot placeholder is present", () => {
    render(I18nWithSlot, {
      props: { message: noPlaceholderMessage },
      slots: { default: () => h("span", "UNUSED") },
    });
    expect(screen.getByText("no slot here")).toBeTruthy();
  });
});
