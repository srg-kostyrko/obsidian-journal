import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { testContainer, type TestHarness } from "@/testing";

import { templaterSupportModal } from "./modals";
import TemplaterSupportHint from "./TemplaterSupportHint.vue";

describe("TemplaterSupportHint", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("renders nothing when Templater is not supported", () => {
    harness.templater.setSupported(false);

    harness.render(TemplaterSupportHint);

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the support hint link when Templater is supported", () => {
    harness.templater.setSupported(true);

    harness.render(TemplaterSupportHint);

    expect(screen.getByRole("link")).toBeTruthy();
  });

  it("opens the caveats modal when the link is clicked", async () => {
    harness.templater.setSupported(true);

    harness.render(TemplaterSupportHint);
    await userEvent.click(screen.getByRole("link"));

    expect(harness.modals.lastOpen().definition).toBe(templaterSupportModal);
  });
});
