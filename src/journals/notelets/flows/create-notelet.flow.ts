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
  openMode?: OpenMode;
  unattended?: boolean;
}

export class CreateNoteletFlow implements Flow<
  CreateNoteletParameters,
  { path: VaultPath },
  NoteletCreationError | WorkspaceOpenError
> {
  readonly #creation = inject(NoteletCreationService);
  readonly #workspace = inject(WorkspaceService);
  readonly #templater = inject(TemplaterService);

  execute(p: CreateNoteletParameters): AsyncResult<{ path: VaultPath }, NoteletCreationError | WorkspaceOpenError> {
    return attempt.in(this, async function* (this: CreateNoteletFlow) {
      const { path } = yield* this.#creation.createNotelet(p.journalName, p.typeId, p.anchor, {
        unattended: p.unattended,
      });
      yield* this.#workspace.openNote(path, p.openMode ?? "active");
      // A notelet is always newly created, so the cursor jump is unconditional where the period
      // flow has to ask whether it created anything.
      yield* this.#templater.cursorJump(path);
      return { path };
    });
  }
}
