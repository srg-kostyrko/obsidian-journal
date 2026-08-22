import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import TemplaterSupportModal from "./TemplaterSupportModal.vue";

describe("TemplaterSupportModal", () => {
  it("lists the three safe-setup options", async () => {
    const harness = await testContainer();
    harness.renderModal(TemplaterSupportModal);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
