import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { dateModificationsModal } from "@/templates/ui/modals";
import { testContainer, type TestHarness } from "@/testing";

import { variableReferenceModal } from "./modals";
import VariableReferenceHint from "./VariableReferenceHint.vue";

const baseProps = {
  context: "name-template" as const,
  journalName: "daily",
  dateFormat: "YYYY-MM-DD",
  hasCycle: false,
  numberingVariableNames: [] as readonly string[],
  promptVariableNames: [] as readonly string[],
};

describe("VariableReferenceHint", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("opens the variable reference modal with forwarded props", async () => {
    harness.render(VariableReferenceHint, { props: baseProps });

    await userEvent.click(screen.getByRole("link"));

    expect(harness.modals.opens.length).toBe(1);
    const lastOpen = harness.modals.lastOpen();
    expect(lastOpen.definition).toBe(variableReferenceModal);
    expect(lastOpen.props).toMatchObject(baseProps);
  });

  it("supplies an openModifications callback that opens the date modifications modal", async () => {
    harness.render(VariableReferenceHint, { props: baseProps });

    await userEvent.click(screen.getByRole("link"));
    const { openModifications } = harness.modals.lastOpen<{ openModifications: () => void }, void>().props;
    openModifications();

    expect(harness.modals.lastOpen().definition).toBe(dateModificationsModal);
  });

  it("forwards numberingVariableNames when provided", async () => {
    harness.render(VariableReferenceHint, { props: { ...baseProps, numberingVariableNames: ["week_no"] } });

    await userEvent.click(screen.getByRole("link"));

    expect(harness.modals.lastOpen().props).toMatchObject({ numberingVariableNames: ["week_no"] });
  });

  it("forwards promptVariableNames when provided", async () => {
    harness.render(VariableReferenceHint, { props: { ...baseProps, promptVariableNames: ["mood"] } });

    await userEvent.click(screen.getByRole("link"));

    expect(harness.modals.lastOpen().props).toMatchObject({ promptVariableNames: ["mood"] });
  });
});
