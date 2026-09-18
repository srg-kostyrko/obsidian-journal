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

function journalNotFound(name: string): RestError {
  // Matches JournalsApiService's own wording (src/api/journals-api.ts) so a client sees the same
  // message whether the 404 came from a route's own journalInfo check or from the API itself.
  return new RestError("journal-not-found", `Journal not found: ${name}`, name);
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

/** Registers Journals' surface on the Local REST API host, scoped to `addRoute`'s own handle. */
export function registerJournalRoutes(addRoute: (path: string) => IRoute, api: JournalsApi): void {
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
}
