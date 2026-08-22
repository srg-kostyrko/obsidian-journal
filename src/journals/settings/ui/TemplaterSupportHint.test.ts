import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { templaterSupportModal } from "./modals";
import TemplaterSupportHint from "./TemplaterSupportHint.vue";

describe("TemplaterSupportHint", () => {
  it("renders nothing when Templater is not supported", async () => {
    const harness = await testContainer();
    harness.templater.setSupported(false);

    harness.render(TemplaterSupportHint);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the support hint link when Templater is supported", async () => {
    const harness = await testContainer();
    harness.templater.setSupported(true);

    harness.render(TemplaterSupportHint);

    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("opens the caveats modal when the link is clicked", async () => {
    const harness = await testContainer();
    harness.templater.setSupported(true);

    harness.render(TemplaterSupportHint);
    await userEvent.click(screen.getByRole("link"));

    expect(harness.modals.lastOpen().definition).toBe(templaterSupportModal);
  });
});
