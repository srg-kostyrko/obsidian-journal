import { RestError } from "./errors";

import type { JournalsApi } from "../public-api";
import type { Request, Response } from "express";

// The host parses a body as JSON only for application/json and three JSON media types of its own;
// a text/* body arrives as a string, anything else as raw bytes (a Buffer), and a
// request with no body leaves req.body as {}. Reading the prototype (rather than naming Buffer,
// which no-restricted-globals bans in production source — see CLAUDE.md) rejects bytes the same
// way it rejects an array or a primitive.
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

// Forwards `body.answers` exactly as given — undefined when the body isn't a plain object, or
// when it is one but carries no `answers` key. The API's own #answers already treats null as
// absent and rejects any other non-plain-object with invalid-answers; turning an absent answers
// into {} here would change behavior, since a required-question journal validates {} as a
// (failed) attempt to answer rather than as "no answers were supplied", producing 400
// invalid-answers instead of the documented 409 prompts-required. The cast only tells the
// compiler what the REST boundary cannot: JSON.parse's output has no static shape.
export function readAnswers(body: unknown): Record<string, unknown> | undefined {
  return (isPlainObject(body) ? body.answers : undefined) as Record<string, unknown> | undefined;
}

// A sentinel distinct from any real query value (including the string "invalid"), so a query
// param that arrived as an array or a nested object (?from=a&from=b, ?type[x]=1) is rejected
// rather than silently treated as absent.
export const INVALID_QUERY_VALUE = Symbol("invalid-query-value");

export function readQueryString(value: unknown): string | undefined | typeof INVALID_QUERY_VALUE {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : INVALID_QUERY_VALUE;
}

export function journalNotFound(name: string): RestError {
  // Matches JournalsApiService's own wording (src/api/journals-api.ts) so a client sees the same
  // message whether the 404 came from a route's own journalInfo check or from the API itself.
  return new RestError("journal-not-found", `Journal not found: ${name}`, name);
}

export function noteNotFound(name: string, date: string): RestError {
  return new RestError("note-not-found", `Note not found: ${name} ${date}`, name);
}

export async function requireJournal(api: JournalsApi, name: string): Promise<void> {
  if ((await api.journalInfo(name)) === null) throw journalNotFound(name);
}

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

function invalidSuffix(): RestError {
  return new RestError(
    "invalid-request",
    'The path suffix is not valid: every segment must be well-formed percent-encoding, and neither "." nor ".." is allowed.',
  );
}

export function readSuffix(request: Request): string[] {
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
      throw invalidSuffix();
    }
    // The alias must resolve inside the note it redirects to; a client normalizes dot segments in
    // the Location, so "." or ".." here would otherwise point the request somewhere else entirely.
    if (decoded === "." || decoded === "..") throw invalidSuffix();
    segments.push(decoded);
  }
  return segments;
}

// Matches the periodic companion's redirectToVault (coddingtonbear/obsidian-local-rest-api-periodic-notes,
// src/routes.ts): per-segment encodeURIComponent for the Location the host resolves against its
// vault root, and a whole-path encodeURI for Content-Location. Unlike that function, the segments
// handed in here already went through readSuffix's raw-path decode, so a suffix segment carrying a
// literal "/" (from a decoded %2F) round-trips as one encoded segment rather than reopening as a
// path boundary. The original query string rides along verbatim: the host's own vault routes read
// parameters of their own (DELETE's ?permanent=true among them), and a 307 that dropped them would
// quietly change what the redirected request does.
export function redirectToNote(request: Request, response: Response, path: string, suffix: readonly string[]): void {
  const segments = [...path.split("/"), ...suffix];
  const queryStart = request.originalUrl.indexOf("?");
  const query = queryStart === -1 ? "" : request.originalUrl.slice(queryStart);
  const location = "/vault/" + segments.map((segment) => encodeURIComponent(segment)).join("/") + query;
  response.set("Content-Location", encodeURI(segments.join("/")));
  response.redirect(307, location);
}

// A request with no body at all still arrives as {}, body-parser's placeholder, so an empty PUT
// is told apart from a JSON object by its headers: a Transfer-Encoding, or a Content-Length other
// than "0", counts as a body. Stricter than body-parser's own hasBody, which counts
// Content-Length: 0 as one too — here that reads as an empty body, so it clears the note.
function carriesBody(request: Request): boolean {
  const length = request.headers["content-length"];
  return request.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0");
}

// The host parses a text/* body to a string and leaves anything else it does not parse as raw
// bytes; application/json arrives as an object, which is not the note's text.
export function readTextBody(request: Request): string | undefined {
  const body: unknown = request.body;
  if (typeof body === "string") return body;
  if (!carriesBody(request)) return "";
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return undefined;
}
