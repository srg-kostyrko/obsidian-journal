import { RestError, sendError } from "./errors";
import { noteJson, noteletJson } from "./json";

import type { JournalsApi } from "../public-api";
import type { IRoute, Request, Response } from "express";

// The host parses a JSON body only for Content-Type: application/json, so req.body may arrive as
// undefined or a Buffer for any other request. Reading the prototype (rather than naming Buffer,
// which no-restricted-globals bans in production source — see CLAUDE.md) rejects those the same
// way it rejects an array or a primitive.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

// Forwards `body.answers` exactly as given — undefined when the body isn't a plain object, or
// when it is one but carries no `answers` key. The API's own #answers already treats null as
// absent and rejects any other non-plain-object with invalid-answers; turning an absent answers
// into {} here would change behavior, since a required-question journal validates {} as a
// (failed) attempt to answer rather than as "no answers were supplied", producing 400
// invalid-answers instead of the documented 409 prompts-required.
function readAnswers(body: unknown): unknown {
  return isPlainObject(body) ? body.answers : undefined;
}

function readNoteletType(body: unknown): string | undefined {
  if (!isPlainObject(body)) return undefined;
  return typeof body.type === "string" ? body.type : undefined;
}

// A sentinel distinct from any real query value (including the string "invalid"), so a query
// param that arrived as an array or a nested object (?from=a&from=b, ?type[x]=1) is rejected
// rather than silently treated as absent.
const INVALID_QUERY_VALUE = Symbol("invalid-query-value");

function readQueryString(value: unknown): string | undefined | typeof INVALID_QUERY_VALUE {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : INVALID_QUERY_VALUE;
}

// A sentinel distinct from a real (possibly empty) segment list, for a suffix that fails to
// decode or that names "." or "..".
const INVALID_SUFFIX = Symbol("invalid-suffix");

// Express decodes req.params[0] before the handler runs, collapsing an encoded %2F into a segment
// boundary — a heading named "A/B" (sent as A%2FB) would come back as three suffix segments
// instead of two. The periodic companion's own suffixSegments has exactly this bug and says so
// (coddingtonbear/obsidian-local-rest-api-periodic-notes, src/routes.ts) — it reads off
// req.params[0] the same way our first cut did. The host's own extractVaultPath/rawSuffixSegments
// (obsidian-local-rest-api's requestHandler.ts) avoid it by recovering the suffix from req.path,
// which is still percent-encoded, splitting on its *real* slashes, and decoding each segment on
// its own; %2F then stays literal content inside the one segment it belongs to. This mirrors that.
// req.path is the whole path here (registerApiExtension mounts every extension router with
// `use(router)`, no prefix), and PREFIX_SEGMENTS is the segment count before the suffix in
// "/journals/:name/:date/*": "", "journals", ":name", ":date".
const PREFIX_SEGMENTS = 4;

function readSuffix(request: Request, hasSuffix: boolean): string[] | typeof INVALID_SUFFIX {
  if (!hasSuffix) return [];
  const rawSegments = request.path
    .split("/")
    .slice(PREFIX_SEGMENTS)
    .filter((segment) => segment.length > 0);

  const segments: string[] = [];
  for (const raw of rawSegments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return INVALID_SUFFIX;
    }
    // The alias must resolve inside the note it redirects to; a client normalizes dot segments in
    // the Location, so "." or ".." here would otherwise point the request somewhere else entirely.
    if (decoded === "." || decoded === "..") return INVALID_SUFFIX;
    segments.push(decoded);
  }
  return segments;
}

function invalidSuffix(): RestError {
  return new RestError(
    "invalid-request",
    'The path suffix is not valid: every segment must be well-formed percent-encoding, and neither "." nor ".." is allowed.',
  );
}

// Matches the periodic companion's redirectToVault (coddingtonbear/obsidian-local-rest-api-periodic-notes,
// src/routes.ts): per-segment encodeURIComponent for the Location the host resolves against its
// vault root, and a whole-path encodeURI for Content-Location. Unlike that function, the segments
// handed in here already went through readSuffix's raw-path decode, so a suffix segment carrying a
// literal "/" (from a decoded %2F) round-trips as one encoded segment rather than reopening as a
// path boundary.
function redirectToNote(response: Response, path: string, suffix: readonly string[]): void {
  const segments = [...path.split("/"), ...suffix];
  const location = "/vault/" + segments.map((segment) => encodeURIComponent(segment)).join("/");
  response.set("Content-Location", encodeURI(segments.join("/")));
  response.redirect(307, location);
}

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

function journalNotFound(name: string): RestError {
  // Matches JournalsApiService's own wording (src/api/journals-api.ts) so a client sees the same
  // message whether the 404 came from a route's own journalInfo check or from the API itself.
  return new RestError("journal-not-found", `Journal not found: ${name}`, name);
}

function noteNotFound(name: string, date: string): RestError {
  return new RestError("note-not-found", `Note not found: ${name} ${date}`, name);
}

function noteletTypeError(body: unknown): RestError {
  if (!isPlainObject(body)) {
    return new RestError(
      "invalid-request",
      "No JSON body was received. Send the request with Content-Type: application/json and a type field.",
    );
  }
  return new RestError("invalid-request", "type must be a string.");
}

async function handleListJournals(response: Response, api: JournalsApi): Promise<void> {
  try {
    response.status(200).json({ journals: await api.listJournals() });
  } catch (error) {
    sendError(response, error);
  }
}

async function handleJournalInfo(request: Request, response: Response, api: JournalsApi): Promise<void> {
  try {
    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }
    response.status(200).json(info);
  } catch (error) {
    sendError(response, error);
  }
}

async function handleListNotes(request: Request, response: Response, api: JournalsApi): Promise<void> {
  try {
    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }

    const from = readQueryString(request.query.from);
    const to = readQueryString(request.query.to);
    const type = readQueryString(request.query.type);
    if (from === INVALID_QUERY_VALUE || to === INVALID_QUERY_VALUE || type === INVALID_QUERY_VALUE) {
      sendError(response, new RestError("invalid-request", "from, to and type must each be a single string value."));
      return;
    }

    if ((from === undefined) !== (to === undefined)) {
      sendError(response, new RestError("invalid-request", "from and to must be supplied together."));
      return;
    }

    if (from === undefined || to === undefined) {
      // Notelets have no unbounded read, so an open-ended listing only ever covers notes.
      const notes = await api.existingNotes(name);
      response.status(200).json({ notes: notes.map(noteJson), notelets: [] });
      return;
    }

    const range = { from, to };
    const [notes, notelets] = await Promise.all([
      api.existingNotes(name, range),
      api.noteletsInRange(name, range, type === undefined ? undefined : { type }),
    ]);
    response.status(200).json({ notes: notes.map(noteJson), notelets: notelets.map(noteletJson) });
  } catch (error) {
    sendError(response, error);
  }
}

async function handleCreateNote(request: Request, response: Response, api: JournalsApi): Promise<void> {
  try {
    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }

    // Forwarded as-is (not validated here) — the API rejects a non-plain-object, non-null
    // answers with invalid-answers, and the cast just tells the compiler what the REST boundary
    // cannot: JSON.parse's output has no static shape.
    const answers = readAnswers(request.body as unknown) as Record<string, unknown> | undefined;
    // confirm: false too: a confirming journal with no questions would otherwise still open a
    // dialog nobody is watching for, and an HTTP call would hang on it.
    const result = await api.ensureNote(name, request.params.date, { prompt: false, confirm: false, answers });
    response.status(result.created ? 201 : 200).json({ ...noteJson(result.note), created: result.created });
  } catch (error) {
    sendError(response, error);
  }
}

async function handleCreateNotelet(request: Request, response: Response, api: JournalsApi): Promise<void> {
  try {
    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }

    const body: unknown = request.body as unknown;
    const type = readNoteletType(body);
    if (type === undefined) {
      sendError(response, noteletTypeError(body));
      return;
    }

    const answers = readAnswers(body) as Record<string, unknown> | undefined;
    // confirm: false alongside notes' own call, for consistency: prompt: false already suppresses
    // the creation prompts here, but nothing should be left open to a confirming type's dialog.
    const notelet = await api.createNotelet(name, request.params.date, type, {
      prompt: false,
      confirm: false,
      answers,
    });
    response.status(201).json(noteletJson(notelet));
  } catch (error) {
    sendError(response, error);
  }
}

async function handleRedirectToExistingNote(
  request: Request,
  response: Response,
  api: JournalsApi,
  hasSuffix: boolean,
): Promise<void> {
  try {
    const suffix = readSuffix(request, hasSuffix);
    if (suffix === INVALID_SUFFIX) {
      sendError(response, invalidSuffix());
      return;
    }

    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }

    const date = request.params.date;
    const notes = await api.notesFor(name, date);
    const note = notes[0];
    if (note === undefined) {
      sendError(response, noteNotFound(name, date));
      return;
    }
    // Separate from the "no note at all" check above (rather than one ||-chain) so
    // @typescript-eslint/prefer-optional-chain doesn't propose collapsing it into an optional
    // chain that would read note.path on a possibly-undefined note.
    if (note.file === null || note.path === null) {
      sendError(response, noteNotFound(name, date));
      return;
    }

    redirectToNote(response, note.path, suffix);
  } catch (error) {
    sendError(response, error);
  }
}

async function handleEnsureNoteAndRedirect(
  request: Request,
  response: Response,
  api: JournalsApi,
  hasSuffix: boolean,
): Promise<void> {
  try {
    const suffix = readSuffix(request, hasSuffix);
    if (suffix === INVALID_SUFFIX) {
      sendError(response, invalidSuffix());
      return;
    }

    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }

    const date = request.params.date;
    let result;
    try {
      // No answers: this is the redirect family, handing content to the host's own vault routes,
      // not the notes endpoint that accepts answers. confirm: false too — see handleCreateNote's
      // own comment above.
      result = await api.ensureNote(name, date, { prompt: false, confirm: false });
    } catch (error) {
      sendError(response, wrapPromptsRequired(error, name, date));
      return;
    }

    redirectToNote(response, result.note.path, suffix);
  } catch (error) {
    sendError(response, error);
  }
}

/** Writes a journal note's whole file while keeping its journal claim. */
export interface NoteContent {
  replace(journal: string, date: string, body: string): Promise<void>;
}

// The host parses a text/* body to a string and leaves anything else it does not parse as raw
// bytes; application/json arrives as an object, which is not the note's text.
function readTextBody(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return undefined;
}

// The host's /vault/ PUT would replace the frontmatter along with the body, taking the journal
// claim with it: the note drops out of the journal and sits orphaned at the period's path. So a
// whole-file PUT is answered here. A section PUT (with a suffix) still redirects, since the host
// leaves the frontmatter alone for those.
async function handleReplaceNote(
  request: Request,
  response: Response,
  api: JournalsApi,
  content: NoteContent,
): Promise<void> {
  try {
    const name = request.params.name;
    const info = await api.journalInfo(name);
    if (info === null) {
      sendError(response, journalNotFound(name));
      return;
    }

    // Read before ensureNote, so a malformed request creates nothing.
    const body = readTextBody(request.body as unknown);
    if (body === undefined) {
      sendError(
        response,
        new RestError(
          "invalid-request",
          "PUT takes the note's whole content as text. Send it with Content-Type: text/markdown.",
        ),
      );
      return;
    }

    const date = request.params.date;
    let result;
    try {
      result = await api.ensureNote(name, date, { prompt: false, confirm: false });
    } catch (error) {
      sendError(response, wrapPromptsRequired(error, name, date));
      return;
    }

    await content.replace(name, result.note.date, body);
    response.status(204).end();
  } catch (error) {
    sendError(response, error);
  }
}

/** Registers Journals' surface on the Local REST API host, scoped to `addRoute`'s own handle. */
export function registerJournalRoutes(
  addRoute: (path: string) => IRoute,
  api: JournalsApi,
  content: NoteContent,
): void {
  // Express 4 does not catch a rejected handler promise, so every handler stays void-returning at
  // the addRoute call site; the actual awaiting (and its own try/catch) lives one level down.
  addRoute("/journals/").get((_request: Request, response: Response) => void handleListJournals(response, api));
  addRoute("/journals/:name/").get(
    (request: Request, response: Response) => void handleJournalInfo(request, response, api),
  );
  addRoute("/journals/:name/notes").get(
    (request: Request, response: Response) => void handleListNotes(request, response, api),
  );
  addRoute("/journals/:name/notes/:date").post(
    (request: Request, response: Response) => void handleCreateNote(request, response, api),
  );
  addRoute("/journals/:name/notelets/:date").post(
    (request: Request, response: Response) => void handleCreateNotelet(request, response, api),
  );

  // Registered after the literal routes above, or "notes"/"notelets" would themselves match
  // :date here first (see the order test in routes.test.ts). Both paths are needed: Express 4
  // matches "/journals/:name/:date/*" only when the URL carries that trailing slash, never
  // against a bare "/journals/:name/:date" (verified against a real express instance) — so
  // hasSuffix, passed to each handler below, is known at registration time rather than sniffed
  // from the request.
  const redirectRoutes: readonly { path: string; hasSuffix: boolean }[] = [
    { path: "/journals/:name/:date", hasSuffix: false },
    { path: "/journals/:name/:date/*", hasSuffix: true },
  ];
  for (const { path, hasSuffix } of redirectRoutes) {
    addRoute(path)
      .get(
        (request: Request, response: Response) => void handleRedirectToExistingNote(request, response, api, hasSuffix),
      )
      .delete(
        (request: Request, response: Response) => void handleRedirectToExistingNote(request, response, api, hasSuffix),
      )
      .put((request: Request, response: Response) =>
        hasSuffix
          ? void handleEnsureNoteAndRedirect(request, response, api, hasSuffix)
          : void handleReplaceNote(request, response, api, content),
      )
      .post(
        (request: Request, response: Response) => void handleEnsureNoteAndRedirect(request, response, api, hasSuffix),
      )
      .patch(
        (request: Request, response: Response) => void handleEnsureNoteAndRedirect(request, response, api, hasSuffix),
      );
  }
}
