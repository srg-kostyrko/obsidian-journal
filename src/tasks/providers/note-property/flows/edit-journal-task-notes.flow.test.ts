import { describe, expect, it } from "vitest";

import { UserAborted } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { editJournalTaskNotesModal } from "../ui/modals";

import { EditJournalTaskNotesFlow } from "./edit-journal-task-notes.flow";

describe("EditJournalTaskNotesFlow", () => {
  it("opens the journal's task-notes modal for that journal", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditJournalTaskNotesFlow).execute({ journalName: "Daily" });
    expect(harness.modals.lastOpen().definition).toBe(editJournalTaskNotesModal);
    expect(harness.modals.lastOpen().props).toEqual({ journalName: "Daily" });
    harness.modals.lastOpen().submit(undefined);

    const result = await running;

    expect(result.kind).toBe("ok");
  });

  it("reports UserAborted when the modal is dismissed", async () => {
    const harness = await testContainer({ modules: [tasksCoreModule] });

    const running = harness.resolve(EditJournalTaskNotesFlow).execute({ journalName: "Daily" });
    harness.modals.lastOpen().cancel();
    const result = await running;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
