import type {
  NoteNotFoundError,
  NotesService,
  NoteWriteError,
  VaultPath,
  WorkspaceService,
} from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";

export interface NoteWriters {
  readonly workspace: WorkspaceService;
  readonly notes: NotesService;
}

export type NoteRewrite = "written" | "refused";

// An open view holds typing it has not saved, which a vault.process write would race and lose; with
// no view the file is all there is. `flush` saves the view before resolving, for a write whose
// order on disk matters to the one after it.
/** Rewrites a note through the open view that holds it, else on disk; `transform` refuses with null. */
export function rewriteNote(
  writers: NoteWriters,
  path: VaultPath,
  transform: (content: string) => string | null,
  options: { readonly flush: boolean },
): AsyncResult<NoteRewrite, NoteNotFoundError | NoteWriteError> {
  const open = writers.workspace.processOpenNote(path, transform);
  if (open === "refused") return AsyncResult.ok("refused");
  if (open === "applied") {
    const written: NoteRewrite = "written";
    return options.flush ? writers.workspace.saveOpenNote(path).map(() => written) : AsyncResult.ok(written);
  }
  // Collected inside the closure: the verdict is reached under vault.process's lock.
  let refused = false;
  return writers.notes
    .process(path, (content) => {
      const next = transform(content);
      if (next !== null) return next;
      refused = true;
      return content;
    })
    .map((): NoteRewrite => (refused ? "refused" : "written"));
}
