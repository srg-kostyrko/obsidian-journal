import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { Flow } from "@/infrastructure/flows";
import { TemplaterService, WorkspaceService } from "@/infrastructure/host";
import type { OpenMode, VaultPath, WorkspaceOpenError } from "@/infrastructure/host";
import { attempt } from "@/infrastructure/result";
import type { AsyncResult } from "@/infrastructure/result";

import { NoteletCreationService } from "../notelet-creation";

import type { TypeId } from "../config";
import type { NoteletCreationError } from "../notelet-creation";

export interface CreateNoteletParameters {
  journalName: string;
  typeId: TypeId;
  anchor: AnchorString;
  /** Omitted opens in the active pane; `null` creates without opening at all. */
  openMode?: OpenMode | null;
  unattended?: boolean;
}

export class CreateNoteletFlow implements Flow<
  CreateNoteletParameters,
  { path: VaultPath; counter?: number },
  NoteletCreationError | WorkspaceOpenError
> {
  readonly #creation = inject(NoteletCreationService);
  readonly #workspace = inject(WorkspaceService);
  readonly #templater = inject(TemplaterService);

  execute(
    p: CreateNoteletParameters,
  ): AsyncResult<{ path: VaultPath; counter?: number }, NoteletCreationError | WorkspaceOpenError> {
    return attempt.in(this, async function* (this: CreateNoteletFlow) {
      const { path, counter } = yield* this.#creation.createNotelet(p.journalName, p.typeId, p.anchor, {
        unattended: p.unattended,
      });
      if (p.openMode !== null) {
        yield* this.#workspace.openNote(path, p.openMode ?? "active");
        // A notelet is always newly created, so the cursor jump is unconditional where the period
        // flow has to ask whether it created anything. It needs an open editor, so it moves with
        // the open.
        yield* this.#templater.cursorJump(path);
      }
      return { path, ...(counter !== undefined && { counter }) };
    });
  }
}
