import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import CodeBlockReferenceHint from "./CodeBlockReferenceHint.vue";
import { codeBlockReferenceModal } from "./modals";

describe("CodeBlockReferenceHint", () => {
  it("opens the code-block reference modal with the journal name", async () => {
    const harness = await testContainer();
    harness.render(CodeBlockReferenceHint, { props: { journalName: "Daily" } });

    await userEvent.click(screen.getByRole("link"));

    expect(harness.modals.opens.length).toBe(1);
    const lastOpen = harness.modals.lastOpen();
    expect(lastOpen.definition).toBe(codeBlockReferenceModal);
    expect(lastOpen.props).toMatchObject({ journalName: "Daily" });
  });
});
