import type { NotesService, VaultPath } from "@/infrastructure/host";
import type { Logger } from "@/infrastructure/logger";

/**
 * Trashes a note created empty for a body that then failed to render — unless it is no longer empty.
 * Rendering can wait on a Templater prompt for as long as the user likes, and the note can be typed
 * into or synced meanwhile; that content is the user's, not a placeholder.
 */
export async function takeBackEmptyNote(
  notes: NotesService,
  logger: Logger,
  path: VaultPath,
  renderError: unknown,
): Promise<void> {
  const content = await notes.read(path);
  if (content.isErr()) return;
  if (content.value.trim() !== "") {
    logger.warn("kept a note that gained content while its body failed to render", { path, renderError });
    return;
  }
  const trashed = await notes.delete(path);
  if (trashed.isErr()) {
    logger.error("could not take back a note whose body failed to render", { path, renderError, error: trashed.error });
  }
}
