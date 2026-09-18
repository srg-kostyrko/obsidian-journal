import { describe, expect, it, vi } from "vitest";

import { sendError, statusFor } from "./errors";
import { registerJournalRoutes, type NoteContent } from "./routes";

import type { JournalsApi } from "../public-api";
import type { IRoute, Request, Response } from "express";

interface RecordedRoute {
  readonly path: string;
  readonly method: "get" | "post" | "put" | "patch" | "delete";
  readonly handler: (request: Request, response: Response) => void;
}

const VERBS = ["get", "post", "put", "patch", "delete"] as const;

function fakeAddRoute(recorded: RecordedRoute[]): (path: string) => IRoute {
  return (path: string) => {
    const route: Record<string, unknown> = {};
    for (const method of VERBS) {
      route[method] = (handler: (request: Request, response: Response) => void) => {
        recorded.push({ path, method, handler });
        return route;
      };
    }
    return route as unknown as IRoute;
  };
}

interface FakeResponse {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
  redirected: { status: number; url: string } | undefined;
  ended: boolean;
}

// onRedirect lets a test observe when redirect() fires relative to other work, without reaching
// for response.redirect as a bare member reference elsewhere — Response#redirect is an overloaded
// type with a deprecated single-arg signature, and @typescript-eslint/no-deprecated flags any
// reference to the member, not just calls matching the deprecated overload.
function fakeResponse(onRedirect?: () => void): FakeResponse & Response {
  const state: FakeResponse = {
    statusCode: undefined,
    body: undefined,
    headers: {},
    redirected: undefined,
    ended: false,
  };
  const response = {
    ...state,
    status(code: number) {
      state.statusCode = code;
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      response.body = body;
      return response;
    },
    set(name: string, value: string) {
      state.headers[name] = value;
      response.headers[name] = value;
      return response;
    },
    end() {
      state.ended = true;
      response.ended = true;
      return response;
    },
    redirect(status: number, url: string) {
      state.redirected = { status, url };
      response.redirected = { status, url };
      onRedirect?.();
    },
  };
  return response as unknown as FakeResponse & Response;
}

function fakeRequest(
  overrides: Partial<{
    params: Record<string, string>;
    query: Record<string, unknown>;
    body: unknown;
    method: string;
    // Still percent-encoded, exactly as Express's own req.path is — see readSuffix in routes.ts.
    path: string;
  }> = {},
): Request {
  return {
    params: {},
    query: {},
    body: undefined,
    method: "GET",
    path: "",
    ...overrides,
  } as unknown as Request;
}

function fakeApi(overrides: Partial<JournalsApi> = {}): JournalsApi {
  return {
    listJournals: vi.fn(),
    journalInfo: vi.fn(),
    notesFor: vi.fn(),
    existingNotes: vi.fn(),
    noteletsInRange: vi.fn(),
    ensureNote: vi.fn(),
    createNotelet: vi.fn(),
    ...overrides,
  } as unknown as JournalsApi;
}

function fakeContent() {
  return { replace: vi.fn<NoteContent["replace"]>().mockResolvedValue(undefined) };
}

function register(api: JournalsApi, content: NoteContent = fakeContent()): RecordedRoute[] {
  const recorded: RecordedRoute[] = [];
  registerJournalRoutes(fakeAddRoute(recorded), api, content);
  return recorded;
}

function findRoute(recorded: RecordedRoute[], path: string, method: RecordedRoute["method"]): RecordedRoute {
  const found = recorded.find((route) => route.path === path && route.method === method);
  if (found === undefined) throw new Error(`no route registered for ${method} ${path}`);
  return found;
}

async function invoke(route: RecordedRoute, request: Request, response: FakeResponse & Response): Promise<void> {
  route.handler(request, response);
  await vi.waitFor(() => {
    expect(response.statusCode).not.toBeUndefined();
  });
}

// The redirect family answers 307 through response.redirect, never response.status/json, so
// waiting on statusCode (as invoke does) would hang forever on the success path.
async function invokeRedirect(
  route: RecordedRoute,
  request: Request,
  response: FakeResponse & Response,
): Promise<void> {
  route.handler(request, response);
  await vi.waitFor(() => {
    expect(response.redirected).not.toBeUndefined();
  });
}

function putRequest(body: unknown): Request {
  return fakeRequest({ params: { name: "work", date: "2026-08-18" }, method: "PUT", body });
}

function noteWithFile(path: string) {
  return {
    journal: "work",
    date: "2026-08-18",
    displayDate: "2026-08-18",
    endDate: "2026-08-18",
    path,
    file: { path },
  };
}

function noteletWithFile(path: string) {
  return {
    journal: "work",
    type: "mood",
    date: "2026-08-18",
    displayDate: "2026-08-18",
    endDate: "2026-08-18",
    path,
    file: { path },
    counter: 1,
  };
}

function ensureResult(created: boolean) {
  return {
    created,
    note: {
      journal: "work",
      date: "2026-08-18",
      displayDate: "2026-08-18",
      endDate: "2026-08-18",
      path: "work/2026-08-18.md",
      file: { path: "work/2026-08-18.md" },
    },
  };
}

function createdNotelet() {
  return {
    journal: "work",
    type: "mood",
    date: "2026-08-18",
    displayDate: "2026-08-18",
    endDate: "2026-08-18",
    path: "work/2026-08-18-1.md",
    file: { path: "work/2026-08-18-1.md" },
    counter: 1,
  };
}

describe("registerJournalRoutes", () => {
  it("registers the notes and notelets routes before any :name/:date route", () => {
    const recorded = register(fakeApi());

    const paths = recorded.map((route) => route.path);
    expect(paths.slice(0, 5)).toEqual([
      "/journals/",
      "/journals/:name/",
      "/journals/:name/notes",
      "/journals/:name/notes/:date",
      "/journals/:name/notelets/:date",
    ]);
    for (const path of paths.slice(5)) {
      expect(path).toMatch(/^\/journals\/:name\/:date/);
    }
  });

  it("registers the redirect family for both the plain and the wildcard path", () => {
    const recorded = register(fakeApi());

    const paths = new Set(recorded.map((route) => route.path));
    expect(paths.has("/journals/:name/:date")).toBe(true);
    expect(paths.has("/journals/:name/:date/*")).toBe(true);
    for (const method of VERBS) {
      expect(findRoute(recorded, "/journals/:name/:date", method)).toBeDefined();
      expect(findRoute(recorded, "/journals/:name/:date/*", method)).toBeDefined();
    }
  });

  describe("GET /journals/", () => {
    it("returns the journal list", async () => {
      const journals = [{ name: "work" }];
      const api = fakeApi({ listJournals: vi.fn().mockResolvedValue(journals) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(findRoute(recorded, "/journals/", "get"), fakeRequest(), response);

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({ journals });
    });

    it("maps a rejection to the error response", async () => {
      const api = fakeApi({ listJournals: vi.fn().mockRejectedValue(new Error("boom")) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(findRoute(recorded, "/journals/", "get"), fakeRequest(), response);

      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual({ code: "internal-error", message: "boom" });
    });
  });

  describe("GET /journals/:name/", () => {
    it("returns the journal's info", async () => {
      const info = { name: "work", shelf: null };
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(info) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(findRoute(recorded, "/journals/:name/", "get"), fakeRequest({ params: { name: "work" } }), response);

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual(info);
    });

    it("gives 404 journal-not-found when journalInfo resolves null", async () => {
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(findRoute(recorded, "/journals/:name/", "get"), fakeRequest({ params: { name: "nope" } }), response);

      expect(response.statusCode).toBe(404);
      expect(response.body).toEqual({
        code: "journal-not-found",
        message: "Journal not found: nope",
        journal: "nope",
      });
    });
  });

  describe("GET /journals/:name/notes", () => {
    it("reads both notes and notelets when from and to are both given", async () => {
      const existingNotes = vi.fn().mockResolvedValue([noteWithFile("work/2026-08-18.md")]);
      const noteletsInRange = vi.fn().mockResolvedValue([noteletWithFile("work/2026-08-18-1.md")]);
      const api = fakeApi({
        journalInfo: vi.fn().mockResolvedValue({ name: "work" }),
        existingNotes,
        noteletsInRange,
      });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        fakeRequest({ params: { name: "work" }, query: { from: "2026-08-01", to: "2026-08-31", type: "mood" } }),
        response,
      );

      expect(response.statusCode).toBe(200);
      expect(existingNotes).toHaveBeenCalledWith("work", { from: "2026-08-01", to: "2026-08-31" });
      expect(noteletsInRange).toHaveBeenCalledWith("work", { from: "2026-08-01", to: "2026-08-31" }, { type: "mood" });
      expect(response.body).toMatchObject({
        notes: [{ path: "work/2026-08-18.md", exists: true }],
        notelets: [{ path: "work/2026-08-18-1.md", counter: 1 }],
      });
    });

    it("answers only notes, unbounded, when from/to are omitted", async () => {
      const existingNotes = vi.fn().mockResolvedValue([noteWithFile("work/2026-08-18.md")]);
      const noteletsInRange = vi.fn();
      const api = fakeApi({
        journalInfo: vi.fn().mockResolvedValue({ name: "work" }),
        existingNotes,
        noteletsInRange,
      });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        fakeRequest({ params: { name: "work" } }),
        response,
      );

      expect(response.statusCode).toBe(200);
      expect(existingNotes).toHaveBeenCalledWith("work");
      expect(noteletsInRange).not.toHaveBeenCalled();
      expect(response.body).toMatchObject({ notelets: [] });
    });

    it("gives 400 invalid-request when only from is given", async () => {
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        fakeRequest({ params: { name: "work" }, query: { from: "2026-08-01" } }),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-request" });
    });

    it("gives 400 invalid-request when a query param arrives as an array, not a string", async () => {
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        // Express/qs parses a repeated key (?from=a&from=b) into an array.
        fakeRequest({ params: { name: "work" }, query: { from: ["2026-08-01", "2026-08-02"], to: "2026-08-31" } }),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-request" });
    });

    it("gives 404 for an unknown journal without reading any notes or notelets", async () => {
      const existingNotes = vi.fn();
      const noteletsInRange = vi.fn();
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null), existingNotes, noteletsInRange });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        fakeRequest({ params: { name: "nope" } }),
        response,
      );

      expect(response.statusCode).toBe(404);
      expect(existingNotes).not.toHaveBeenCalled();
      expect(noteletsInRange).not.toHaveBeenCalled();
    });

    it("never puts a file key anywhere in the response", async () => {
      const existingNotes = vi.fn().mockResolvedValue([noteWithFile("work/2026-08-18.md")]);
      const noteletsInRange = vi.fn().mockResolvedValue([noteletWithFile("work/2026-08-18-1.md")]);
      const api = fakeApi({
        journalInfo: vi.fn().mockResolvedValue({ name: "work" }),
        existingNotes,
        noteletsInRange,
      });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        fakeRequest({ params: { name: "work" }, query: { from: "2026-08-01", to: "2026-08-31" } }),
        response,
      );

      expect(JSON.stringify(response.body)).not.toContain('"file"');
    });
  });

  describe("POST /journals/:name/notes/:date", () => {
    it("returns 201 with created: true when ensureNote creates the note", async () => {
      const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(201);
      expect(response.body).toMatchObject({ created: true, path: "work/2026-08-18.md" });
      expect(JSON.stringify(response.body)).not.toContain('"file"');
    });

    it("returns 200 with created: false when the note already exists", async () => {
      const ensureNote = vi.fn().mockResolvedValue(ensureResult(false));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({ created: false });
    });

    it("calls ensureNote with prompt: false, confirm: false and the body's answers", async () => {
      const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" }, body: { answers: { mood: "good" } } }),
        response,
      );

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
        prompt: false,
        confirm: false,
        answers: { mood: "good" },
      });
    });

    it("treats a missing body as undefined answers", async () => {
      const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
        prompt: false,
        confirm: false,
        answers: undefined,
      });
    });

    it("treats a Buffer body as undefined answers", async () => {
      const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      // A stand-in for what the host hands over on a non-JSON content type: an object whose
      // prototype is not Object.prototype, the same shape a real Buffer has.
      const bufferLike = Object.create({ constructor: { name: "Buffer" } }) as unknown;

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" }, body: bufferLike }),
        response,
      );

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
        prompt: false,
        confirm: false,
        answers: undefined,
      });
    });

    it("forwards a non-object answers value unchanged, letting the API reject it", async () => {
      const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" }, body: { answers: "x" } }),
        response,
      );

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
        prompt: false,
        confirm: false,
        answers: "x",
      });
    });

    it("surfaces the API's prompts-required as 409 when no answers were sent to a required question", async () => {
      const error = Object.assign(new Error("Answers required"), { code: "prompts-required" });
      const ensureNote = vi.fn().mockRejectedValue(error);
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
        prompt: false,
        confirm: false,
        answers: undefined,
      });
      expect(response.statusCode).toBe(409);
    });

    it("gives 404 for an unknown journal", async () => {
      const ensureNote = vi.fn();
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "nope", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(404);
      expect(ensureNote).not.toHaveBeenCalled();
    });
  });

  describe("POST /journals/:name/notelets/:date", () => {
    it("gives 400 invalid-request when type is missing", async () => {
      const createNotelet = vi.fn();
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), createNotelet });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notelets/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" }, body: {} }),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-request" });
      expect(createNotelet).not.toHaveBeenCalled();
    });

    it("mentions Content-Type: application/json when the body never parsed as JSON", async () => {
      const createNotelet = vi.fn();
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), createNotelet });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notelets/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({
        code: "invalid-request",
        message: expect.stringContaining("Content-Type: application/json") as unknown,
      });
    });

    it("gives 400 invalid-request when type is not a string", async () => {
      const createNotelet = vi.fn();
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), createNotelet });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notelets/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" }, body: { type: 42 } }),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(createNotelet).not.toHaveBeenCalled();
    });

    it("gives 404 for an unknown journal before validating the body", async () => {
      const createNotelet = vi.fn();
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null), createNotelet });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notelets/:date", "post"),
        // No type in the body either — the 404 must still win.
        fakeRequest({ params: { name: "nope", date: "2026-08-18" }, body: {} }),
        response,
      );

      expect(response.statusCode).toBe(404);
      expect(createNotelet).not.toHaveBeenCalled();
    });

    it("returns 201, no file key, and calls createNotelet with prompt: false, confirm: false and the answers", async () => {
      const createNotelet = vi.fn().mockResolvedValue(createdNotelet());
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), createNotelet });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notelets/:date", "post"),
        fakeRequest({
          params: { name: "work", date: "2026-08-18" },
          body: { type: "mood", answers: { mood: "good" } },
        }),
        response,
      );

      expect(response.statusCode).toBe(201);
      expect(response.body).toMatchObject({ path: "work/2026-08-18-1.md", counter: 1 });
      expect(JSON.stringify(response.body)).not.toContain('"file"');
      expect(createNotelet).toHaveBeenCalledWith("work", "2026-08-18", "mood", {
        prompt: false,
        confirm: false,
        answers: { mood: "good" },
      });
    });
  });

  describe("the redirect family (/journals/:name/:date and /journals/:name/:date/*)", () => {
    describe("GET and DELETE: resolve an existing note, never create", () => {
      it.each(["get", "delete"] as const)(
        "%s redirects 307 to the encoded vault path of an existing note",
        async (method) => {
          const notesFor = vi.fn().mockResolvedValue([noteWithFile("Journal/Día 1.md")]);
          const ensureNote = vi.fn();
          const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor, ensureNote });
          const recorded = register(api);
          const response = fakeResponse();

          await invokeRedirect(
            findRoute(recorded, "/journals/:name/:date", method),
            fakeRequest({ params: { name: "work", date: "2026-08-18" }, method }),
            response,
          );

          expect(notesFor).toHaveBeenCalledWith("work", "2026-08-18");
          expect(response.redirected).toEqual({
            status: 307,
            url: "/vault/Journal/D%C3%ADa%201.md",
          });
          expect(response.headers["Content-Location"]).toBe(encodeURI("Journal/Día 1.md"));
          expect(ensureNote).not.toHaveBeenCalled();
        },
      );

      it("appends an encoded heading suffix from the wildcard path", async () => {
        const notesFor = vi.fn().mockResolvedValue([noteWithFile("work/2026-08-18.md")]);
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invokeRedirect(
          findRoute(recorded, "/journals/:name/:date/*", "get"),
          fakeRequest({
            params: { name: "work", date: "2026-08-18", 0: "Tasks/Sub" },
            path: "/journals/work/2026-08-18/Tasks/Sub",
          }),
          response,
        );

        expect(response.redirected).toEqual({
          status: 307,
          url: "/vault/work/2026-08-18.md/Tasks/Sub",
        });
        expect(response.headers["Content-Location"]).toBe("work/2026-08-18.md/Tasks/Sub");
      });

      it("round-trips a heading segment carrying an encoded slash (%2F) as one segment, not two", async () => {
        // Express would decode req.params[0] to "heading/A/B" for this request, collapsing the
        // encoded %2F into a segment boundary indistinguishable from the real one before it — that
        // is exactly the bug this recovers from by reading req.path (still encoded) instead.
        const notesFor = vi.fn().mockResolvedValue([noteWithFile("work/2026-08-18.md")]);
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invokeRedirect(
          findRoute(recorded, "/journals/:name/:date/*", "get"),
          fakeRequest({
            params: { name: "work", date: "2026-08-18", 0: "heading/A/B" },
            path: "/journals/work/2026-08-18/heading/A%2FB",
          }),
          response,
        );

        expect(response.redirected).toEqual({
          status: 307,
          url: "/vault/work/2026-08-18.md/heading/A%2FB",
        });
      });

      it("gives 400 invalid-request when a suffix segment is a malformed percent-encoding", async () => {
        const notesFor = vi.fn();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date/*", "get"),
          fakeRequest({
            params: { name: "work", date: "2026-08-18", 0: "%" },
            path: "/journals/work/2026-08-18/%",
          }),
          response,
        );

        expect(response.statusCode).toBe(400);
        expect(response.body).toMatchObject({ code: "invalid-request" });
        expect(notesFor).not.toHaveBeenCalled();
      });

      it.each(["..", "."])("gives 400 invalid-request when a suffix segment decodes to %s", async (segment) => {
        const notesFor = vi.fn();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date/*", "get"),
          fakeRequest({
            params: { name: "work", date: "2026-08-18", 0: segment },
            path: `/journals/work/2026-08-18/${segment}`,
          }),
          response,
        );

        expect(response.statusCode).toBe(400);
        expect(response.body).toMatchObject({ code: "invalid-request" });
        expect(notesFor).not.toHaveBeenCalled();
      });

      it("gives 400 invalid-request when a percent-encoded suffix segment decodes to ..", async () => {
        const notesFor = vi.fn();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date/*", "get"),
          fakeRequest({
            params: { name: "work", date: "2026-08-18", 0: ".." },
            path: "/journals/work/2026-08-18/%2e%2e",
          }),
          response,
        );

        expect(response.statusCode).toBe(400);
        expect(response.body).toMatchObject({ code: "invalid-request" });
        expect(notesFor).not.toHaveBeenCalled();
      });

      it("gives 400 invalid-date when the date is invalid, over the redirect family", async () => {
        const error = Object.assign(new Error("bad date"), { code: "invalid-date" });
        const notesFor = vi.fn().mockRejectedValue(error);
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date", "get"),
          fakeRequest({ params: { name: "work", date: "not-a-date" } }),
          response,
        );

        expect(response.statusCode).toBe(400);
        expect(response.body).toMatchObject({ code: "invalid-date" });
      });

      it.each(["get", "delete"] as const)(
        "%s gives 404 note-not-found when no note exists, without calling ensureNote",
        async (method) => {
          const notesFor = vi.fn().mockResolvedValue([]);
          const ensureNote = vi.fn();
          const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor, ensureNote });
          const recorded = register(api);
          const response = fakeResponse();

          await invoke(
            findRoute(recorded, "/journals/:name/:date", method),
            fakeRequest({ params: { name: "work", date: "2026-08-18" }, method }),
            response,
          );

          expect(response.statusCode).toBe(404);
          expect(response.body).toMatchObject({ code: "note-not-found" });
          expect(ensureNote).not.toHaveBeenCalled();
        },
      );

      it("gives 404 note-not-found when the note's file is null", async () => {
        const notesFor = vi.fn().mockResolvedValue([
          {
            journal: "work",
            date: "2026-08-18",
            displayDate: "2026-08-18",
            endDate: "2026-08-18",
            path: null,
            file: null,
          },
        ]);
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), notesFor });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date", "get"),
          fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
          response,
        );

        expect(response.statusCode).toBe(404);
        expect(response.body).toMatchObject({ code: "note-not-found" });
      });
    });

    describe("PUT, POST and PATCH: ensure the note exists first, then redirect", () => {
      it.each(["post", "patch"] as const)(
        "%s calls ensureNote with prompt: false, confirm: false, then redirects to its path",
        async (method) => {
          const order: string[] = [];
          const ensureNote = vi.fn().mockImplementation(async () => {
            order.push("ensureNote");
            return ensureResult(true);
          });
          const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
          const recorded = register(api);
          const response = fakeResponse(() => order.push("redirect"));

          await invokeRedirect(
            findRoute(recorded, "/journals/:name/:date", method),
            fakeRequest({ params: { name: "work", date: "2026-08-18" }, method }),
            response,
          );

          expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", { prompt: false, confirm: false });
          expect(response.redirected).toEqual({ status: 307, url: "/vault/work/2026-08-18.md" });
          expect(order).toEqual(["ensureNote", "redirect"]);
        },
      );

      it.each([
        ["/journals/:name/:date", "/journals/work/2026-08-18"],
        ["/journals/:name/:date/*", "/journals/work/2026-08-18/Tasks"],
      ])(
        "wraps a prompts-required rejection on PUT %s with a message pointing at the notes endpoint",
        async (route, path) => {
          const error = Object.assign(new Error("Answers required"), { code: "prompts-required", journal: "work" });
          const ensureNote = vi.fn().mockRejectedValue(error);
          const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
          const recorded = register(api);
          const response = fakeResponse();

          await invoke(
            findRoute(recorded, route, "put"),
            fakeRequest({ params: { name: "work", date: "2026-08-18" }, path, method: "PUT", body: "body" }),
            response,
          );

          expect(response.statusCode).toBe(409);
          expect(response.body).toMatchObject({
            code: "prompts-required",
            journal: "work",
            message: expect.stringContaining("POST /journals/work/notes/2026-08-18") as unknown,
          });
        },
      );

      it("put on the wildcard path calls ensureNote and redirects with the suffix appended", async () => {
        const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
        const recorded = register(api);
        const response = fakeResponse();

        await invokeRedirect(
          findRoute(recorded, "/journals/:name/:date/*", "put"),
          fakeRequest({
            params: { name: "work", date: "2026-08-18", 0: "Tasks/Sub" },
            path: "/journals/work/2026-08-18/Tasks/Sub",
            method: "put",
          }),
          response,
        );

        expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", { prompt: false, confirm: false });
        expect(response.redirected).toEqual({ status: 307, url: "/vault/work/2026-08-18.md/Tasks/Sub" });
      });
    });

    describe("PUT without a suffix: replace the whole note, keeping its journal claim", () => {
      it("ensures the note, replaces its content with the body, then answers 204 with no body", async () => {
        const order: string[] = [];
        const ensureNote = vi.fn().mockImplementation(async () => {
          order.push("ensureNote");
          return ensureResult(false);
        });
        const content = fakeContent();
        content.replace.mockImplementation(() => {
          order.push("replace");
          return Promise.resolve();
        });
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
        const recorded = register(api, content);
        const response = fakeResponse();

        await invoke(findRoute(recorded, "/journals/:name/:date", "put"), putRequest("# New body\n"), response);

        expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", { prompt: false, confirm: false });
        expect(content.replace).toHaveBeenCalledWith("work", "2026-08-18", "# New body\n");
        expect(order).toEqual(["ensureNote", "replace"]);
        expect(response.statusCode).toBe(204);
        expect(response.ended).toBe(true);
        expect(response.body).toBeUndefined();
        expect(response.redirected).toBeUndefined();
      });

      it("replaces with the note's own date, not the date the request named", async () => {
        const ensureNote = vi.fn().mockResolvedValue({
          ...ensureResult(false),
          note: { ...ensureResult(false).note, date: "2026-08-17" },
        });
        const content = fakeContent();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
        const recorded = register(api, content);
        const response = fakeResponse();

        await invoke(findRoute(recorded, "/journals/:name/:date", "put"), putRequest("body"), response);

        expect(content.replace).toHaveBeenCalledWith("work", "2026-08-17", "body");
      });

      it("decodes a byte body as UTF-8", async () => {
        const content = fakeContent();
        const api = fakeApi({
          journalInfo: vi.fn().mockResolvedValue({ name: "work" }),
          ensureNote: vi.fn().mockResolvedValue(ensureResult(false)),
        });
        const recorded = register(api, content);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date", "put"),
          putRequest(new TextEncoder().encode("Café ✓")),
          response,
        );

        expect(content.replace).toHaveBeenCalledWith("work", "2026-08-18", "Café ✓");
        expect(response.statusCode).toBe(204);
      });

      it.each([
        ["a parsed JSON object", { content: "x" }],
        ["no body at all", undefined],
      ])("gives 400 invalid-request for %s, before creating anything", async (_label, body) => {
        const ensureNote = vi.fn().mockResolvedValue(ensureResult(true));
        const content = fakeContent();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
        const recorded = register(api, content);
        const response = fakeResponse();

        await invoke(findRoute(recorded, "/journals/:name/:date", "put"), putRequest(body), response);

        expect(response.statusCode).toBe(400);
        expect(response.body).toMatchObject({
          code: "invalid-request",
          message: expect.stringContaining("Content-Type: text/markdown") as unknown,
        });
        expect(ensureNote).not.toHaveBeenCalled();
        expect(content.replace).not.toHaveBeenCalled();
      });

      it("gives 404 for an unknown journal without touching content", async () => {
        const content = fakeContent();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null) });
        const recorded = register(api, content);
        const response = fakeResponse();

        await invoke(findRoute(recorded, "/journals/:name/:date", "put"), putRequest("body"), response);

        expect(response.statusCode).toBe(404);
        expect(content.replace).not.toHaveBeenCalled();
      });

      it("maps a failed replace through the error body", async () => {
        const content = fakeContent();
        content.replace.mockRejectedValue(Object.assign(new Error("Note not found"), { code: "note-not-found" }));
        const api = fakeApi({
          journalInfo: vi.fn().mockResolvedValue({ name: "work" }),
          ensureNote: vi.fn().mockResolvedValue(ensureResult(false)),
        });
        const recorded = register(api, content);
        const response = fakeResponse();

        await invoke(findRoute(recorded, "/journals/:name/:date", "put"), putRequest("body"), response);

        expect(response.statusCode).toBe(404);
        expect(response.body).toMatchObject({ code: "note-not-found" });
      });
    });

    it.each(["get", "put", "post", "patch", "delete"] as const)(
      "%s gives 404 for an unknown journal",
      async (method) => {
        const notesFor = vi.fn();
        const ensureNote = vi.fn();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null), notesFor, ensureNote });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date", method),
          fakeRequest({ params: { name: "nope", date: "2026-08-18" }, method }),
          response,
        );

        expect(response.statusCode).toBe(404);
        expect(response.body).toMatchObject({ code: "journal-not-found" });
        expect(notesFor).not.toHaveBeenCalled();
        expect(ensureNote).not.toHaveBeenCalled();
      },
    );

    it.each(["get", "put", "post", "patch", "delete"] as const)(
      "%s gives 404 for an unknown journal on the wildcard path",
      async (method) => {
        const notesFor = vi.fn();
        const ensureNote = vi.fn();
        const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null), notesFor, ensureNote });
        const recorded = register(api);
        const response = fakeResponse();

        await invoke(
          findRoute(recorded, "/journals/:name/:date/*", method),
          fakeRequest({
            params: { name: "nope", date: "2026-08-18", 0: "" },
            path: "/journals/nope/2026-08-18/",
            method,
          }),
          response,
        );

        expect(response.statusCode).toBe(404);
        expect(response.body).toMatchObject({ code: "journal-not-found" });
        expect(notesFor).not.toHaveBeenCalled();
        expect(ensureNote).not.toHaveBeenCalled();
      },
    );
  });

  describe("error mapping", () => {
    it("maps an invalid-answers rejection to 400 with the exact body", async () => {
      const issues = [{ variable: "mood", reason: "required" }];
      const error = Object.assign(new Error("Invalid answers for work"), {
        code: "invalid-answers",
        journal: "work",
        issues,
      });
      const ensureNote = vi.fn().mockRejectedValue(error);
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({
        code: "invalid-answers",
        message: "Invalid answers for work",
        journal: "work",
        issues,
      });
    });

    it("maps a prompts-required rejection to 409", async () => {
      const error = Object.assign(new Error("Answers required"), { code: "prompts-required" });
      const ensureNote = vi.fn().mockRejectedValue(error);
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(409);
    });

    it("maps an unmappable-date rejection to 422", async () => {
      const error = Object.assign(new Error("cannot map the date"), { code: "unmappable-date" });
      const ensureNote = vi.fn().mockRejectedValue(error);
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(422);
    });

    it("maps a plain Error to 500 internal-error", async () => {
      const ensureNote = vi.fn().mockRejectedValue(new Error("boom"));
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue({ name: "work" }), ensureNote });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes/:date", "post"),
        fakeRequest({ params: { name: "work", date: "2026-08-18" } }),
        response,
      );

      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual({ code: "internal-error", message: "boom" });
    });
  });
});

describe("sendError", () => {
  it("falls back to the code, not the literal 'undefined', when the error carries no message", () => {
    const response = fakeResponse();

    sendError(response, { code: "unmappable-date" });

    expect(response.statusCode).toBe(422);
    expect(response.body).toEqual({ code: "unmappable-date", message: "unmappable-date" });
  });
});

describe("statusFor", () => {
  it.each([
    ["journal-not-found", 404],
    ["no-matching-journal", 404],
    ["notelet-type-not-found", 404],
    ["outside-timeline", 404],
    ["note-not-found", 404],
    ["invalid-date", 400],
    ["invalid-answers", 400],
    ["invalid-request", 400],
    ["unmappable-date", 422],
    ["prompts-required", 409],
    ["something-unmapped", 500],
  ])("%s -> %i", (code, status) => {
    expect(statusFor(code)).toBe(status);
  });
});
