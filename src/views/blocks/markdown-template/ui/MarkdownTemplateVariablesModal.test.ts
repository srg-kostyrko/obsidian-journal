import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { dateModificationsModal } from "@/templates/ui/modals";
import { testContainer, type TestHarness } from "@/testing";

import MarkdownTemplateVariablesModal from "./MarkdownTemplateVariablesModal.vue";

describe("MarkdownTemplateVariablesModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("lists the journal_link variable", () => {
    harness.render(MarkdownTemplateVariablesModal);

    expect(screen.getByText("{{journal_link(name)}}")).toBeTruthy();
  });

  it("opens the date modifications modal from a variable's modifications link", async () => {
    harness.render(MarkdownTemplateVariablesModal);

    await userEvent.click(screen.getAllByRole("link", { name: /additional modifications/i })[0]);

    expect(harness.modals.lastOpen().definition).toBe(dateModificationsModal);
  });
});
