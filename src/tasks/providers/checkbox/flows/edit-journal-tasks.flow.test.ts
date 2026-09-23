import { describe, expect, it } from "vitest";

import { UserAborted } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { editJournalTasksModal } from "../ui/modals";

import { EditJournalTasksFlow } from "./edit-journal-tasks.flow";

describe("EditJournalTasksFlow", () => {
  it("opens the journal tasks modal", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditJournalTasksFlow).execute({ journalName: "Daily" });
    expect(harness.modals.lastOpen().definition).toBe(editJournalTasksModal);
    harness.modals.lastOpen().submit(undefined);
    const result = await running;

    expect(result.kind).toBe("ok");
  });

  it("passes the journal name to the modal", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditJournalTasksFlow).execute({ journalName: "Daily" });
    expect(harness.modals.lastOpen().props).toEqual({ journalName: "Daily" });
    harness.modals.lastOpen().submit(undefined);
    await running;
  });

  // Dismissing a modal is not a failure the caller reacts to; the flow layer logs it and
  // shows nothing.
  it("reports UserAborted when the modal is dismissed", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditJournalTasksFlow).execute({ journalName: "Daily" });
    harness.modals.lastOpen().cancel();
    const result = await running;

    expect(result.kind).toBe("err");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
