import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { NoteNotFoundError } from "@/infrastructure/host";
import { JournalNotFoundError } from "@/journals/errors";
import { BodyFrontmatterError } from "@/journals/notes/errors";
import { NoteCreationService } from "@/journals/notes/note-creation";

import { JournalsApiService } from "../../journals-api";
import { RestError } from "../errors";
import { journalNotFound, noteNotFound, readSuffix, readTextBody, redirectToNote, requireJournal } from "../request";

import type { JournalsApi } from "../../public-api";
import type { RestHandler, RestRoute } from "../route";
import type { Request, Response } from "express";

// The redirect family hands a request over to the host's own /vault/ routes for the journal note
// it names. It is two routes, not one route with two paths: Express 4 matches
// "/journals/:name/:date/*" only when the URL carries that trailing slash, never against a bare
// "/journals/:name/:date" (verified against a real express instance), and the two answer PUT
// differently — so whether a suffix applies is known from the route itself rather than sniffed
// from the request.

// sendError passes an error's own message straight through, and the API's prompts-required
// message says nothing about the redirect family's own write path — a caller needs to be told
// where the answers actually go. Spreading (rather than naming code/journal/issues one by one)
// keeps whatever fields the thrown error carries; Error#message itself is non-enumerable, so the
// spread drops the original message on its own and the explicit key below is the only one that
// lands.
function wrapPromptsRequired(error: unknown, name: string, date: string): unknown {
  if (typeof error !== "object" || error === null) return error;
  const record = error as Record<string, unknown>;
  if (record.code !== "prompts-required") return error;
  return {
    ...record,
    message: `This journal needs answers before a note can be created. Use POST /journals/${name}/notes/${date} with an answers object instead.`,
  };
}

// The request body here is note content, never answers — answers go through the notes endpoint,
// which the prompts-required message points at. confirm: false because nobody is watching for a dialog.
async function ensureWithoutAnswers(api: JournalsApi, name: string, date: string) {
  try {
    return await api.ensureNote(name, date, { prompt: false, confirm: false });
  } catch (error) {
    throw wrapPromptsRequired(error, name, date);
  }
}

function redirectToExisting(api: JournalsApi, suffixOf: (request: Request) => string[]): RestHandler {
  return async (request, response) => {
    const suffix = suffixOf(request);
    const name = request.params.name;
    await requireJournal(api, name);

    const date = request.params.date;
    const notes = await api.notesFor(name, date);
    const note = notes[0];
    if (note === undefined) throw noteNotFound(name, date);
    // Separate from the "no note at all" check above (rather than one ||-chain) so
    // @typescript-eslint/prefer-optional-chain doesn't propose collapsing it into an optional
    // chain that would read note.path on a possibly-undefined note.
    if (note.file === null || note.path === null) throw noteNotFound(name, date);

    redirectToNote(request, response, note.path, suffix);
  };
}

function ensureAndRedirect(api: JournalsApi, suffixOf: (request: Request) => string[]): RestHandler {
  return async (request, response) => {
    const suffix = suffixOf(request);
    const name = request.params.name;
    await requireJournal(api, name);

    const result = await ensureWithoutAnswers(api, name, request.params.date);
    redirectToNote(request, response, result.note.path, suffix);
  };
}

function unreadableFrontmatter(journal: string, reason: string): RestError {
  return new RestError("invalid-request", `The frontmatter in the request body could not be read: ${reason}`, journal);
}

const noSuffix = (): string[] => [];

export class NoteRedirectRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);
  readonly #creation = inject(NoteCreationService);

  readonly path = "/journals/:name/:date";
  readonly handlers = {
    get: redirectToExisting(this.#api, noSuffix),
    delete: redirectToExisting(this.#api, noSuffix),
    put: (request: Request, response: Response) => this.#replace(request, response),
    post: ensureAndRedirect(this.#api, noSuffix),
    patch: ensureAndRedirect(this.#api, noSuffix),
  } satisfies RestRoute["handlers"];

  // The host's /vault/ PUT would replace the frontmatter along with the body, taking the journal
  // claim with it: the note drops out of the journal and sits orphaned at the period's path. So a
  // whole-file PUT is answered here. A section PUT (with a suffix) still redirects, since the host
  // leaves the frontmatter alone for those.
  async #replace(request: Request, response: Response): Promise<void> {
    const name = request.params.name;
    await requireJournal(this.#api, name);

    // Read and checked before ensureNote, so a malformed request creates nothing.
    const body = readTextBody(request);
    if (body === undefined) {
      throw new RestError(
        "invalid-request",
        "PUT takes the note's whole content as text. Send it with Content-Type: text/markdown.",
      );
    }
    const checked = this.#creation.checkContent(body);
    if (checked.isErr()) throw unreadableFrontmatter(name, checked.error);

    const { note } = await ensureWithoutAnswers(this.#api, name, request.params.date);
    // The note's own date, which is its anchor — not the date the request named.
    const replaced = await this.#creation.replaceContent(name, note.date as AnchorString, body);
    if (replaced.isErr()) {
      const error = replaced.error;
      if (error instanceof JournalNotFoundError) throw journalNotFound(name);
      if (error instanceof BodyFrontmatterError) throw unreadableFrontmatter(name, error.reason);
      if (error instanceof NoteNotFoundError) throw noteNotFound(name, note.date);
      throw new RestError("write-failed", error.message, name);
    }
    response.status(204).end();
  }
}

export class NoteSectionRedirectRoute implements RestRoute {
  readonly #api = inject(JournalsApiService);

  readonly path = "/journals/:name/:date/*";
  readonly handlers = {
    get: redirectToExisting(this.#api, readSuffix),
    delete: redirectToExisting(this.#api, readSuffix),
    put: ensureAndRedirect(this.#api, readSuffix),
    post: ensureAndRedirect(this.#api, readSuffix),
    patch: ensureAndRedirect(this.#api, readSuffix),
  } satisfies RestRoute["handlers"];
}
