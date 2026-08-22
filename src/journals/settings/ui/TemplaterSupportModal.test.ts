import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import TemplaterSupportModal from "./TemplaterSupportModal.vue";

describe("TemplaterSupportModal", () => {
  it("lists the three safe-setup options", () => {
    render(TemplaterSupportModal);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
