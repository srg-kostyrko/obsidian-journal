import { describe, expect, it } from "vitest";

import { UserAborted } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { editNotePropertyProviderModal } from "../ui/modals";

import { EditNotePropertyProviderFlow } from "./edit-note-property-provider.flow";

describe("EditNotePropertyProviderFlow", () => {
  it("opens the provider modal", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditNotePropertyProviderFlow).execute();
    expect(harness.modals.lastOpen().definition).toBe(editNotePropertyProviderModal);
    harness.modals.lastOpen().submit(undefined);
    const result = await running;

    expect(result.kind).toBe("ok");
  });

  it("reports UserAborted when the modal is dismissed", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditNotePropertyProviderFlow).execute();
    harness.modals.lastOpen().cancel();
    const result = await running;

    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
