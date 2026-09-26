import { describe, expect, it } from "vitest";

import { checkboxTarget } from "./task-row-click";

function eventWithTarget(target: EventTarget): Event {
  const event = new Event("click");
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("checkboxTarget", () => {
  it("returns the input when the click landed on a checkbox", () => {
    const input = document.createElement("input");
    input.type = "checkbox";
    expect(checkboxTarget(eventWithTarget(input))).toBe(input);
  });

  it("returns null for a click that did not land on an input at all", () => {
    const li = document.createElement("li");
    expect(checkboxTarget(eventWithTarget(li))).toBeNull();
  });

  it("returns null for an input that is not a checkbox", () => {
    const input = document.createElement("input");
    input.type = "text";
    expect(checkboxTarget(eventWithTarget(input))).toBeNull();
  });
});
