import { inject } from "@/infrastructure/di";
import { Flows, type Flow, type FlowError } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { EditNotePropertyProviderFlow } from "../../flows/edit-note-property-provider.flow";
import { notePropertySlice } from "../../slice";
import { fromTaskNotes } from "../mapping";
import { TaskNotesSource } from "../source";

export class SetUpFromTaskNotesFlow implements Flow<Record<string, never>, void, FlowError> {
  readonly #source = inject(TaskNotesSource);
  readonly #slice = inject(SettingsService).getSlice(notePropertySlice);
  readonly #flows = inject(Flows);

  execute(): AsyncResult<void, FlowError> {
    // Read again at click time: TaskNotes may have been disabled since the card rendered.
    const read = this.#source.read();
    if (read.kind !== "read") return AsyncResult.ok();
    // One assignment, so the provider refills once. The modal that follows only confirms the copy:
    // cancelling it keeps what was written here.
    this.#slice.state = { ...this.#slice.state, ...fromTaskNotes(read.settings) };
    return this.#flows.invoke(EditNotePropertyProviderFlow, {});
  }
}
