import { describe, expect, it } from "vitest";

import { UserAborted } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { editCheckboxProviderModal } from "../ui/modals";

import { EditCheckboxProviderFlow } from "./edit-checkbox-provider.flow";

describe("EditCheckboxProviderFlow", () => {
  it("opens the provider modal", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditCheckboxProviderFlow).execute();
    expect(harness.modals.lastOpen().definition).toBe(editCheckboxProviderModal);
    harness.modals.lastOpen().submit(undefined);
    const result = await running;

    expect(result.kind).toBe("ok");
  });

  // Dismissing a modal is not a failure the caller reacts to; the flow layer logs it and
  // shows nothing.
  it("reports UserAborted when the modal is dismissed", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditCheckboxProviderFlow).execute();
    harness.modals.lastOpen().cancel();
    const result = await running;

    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
