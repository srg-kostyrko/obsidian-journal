import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer } from "@/testing";

import ConditionTypeOnly from "./ConditionTypeOnly.vue";

async function mount(type: "has-note") {
  const harness = await testContainer();
  return harness.render(ConditionTypeOnly, { props: { type } });
}

describe("ConditionTypeOnly", () => {
  it("renders the description for has-note", async () => {
    await mount("has-note");
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });
});
