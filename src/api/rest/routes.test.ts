import { describe, expect, it, vi } from "vitest";

import { statusFor } from "./errors";
import { registerJournalRoutes } from "./routes";

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
}

function fakeResponse(): FakeResponse & Response {
  const state: FakeResponse = { statusCode: undefined, body: undefined, headers: {}, redirected: undefined };
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
    redirect(status: number, url: string) {
      state.redirected = { status, url };
      response.redirected = { status, url };
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
  }> = {},
): Request {
  return {
    params: {},
    query: {},
    body: undefined,
    method: "GET",
    ...overrides,
  } as unknown as Request;
}

function fakeApi(overrides: Partial<JournalsApi> = {}): JournalsApi {
  return {
    listJournals: vi.fn(),
    journalInfo: vi.fn(),
    existingNotes: vi.fn(),
    noteletsInRange: vi.fn(),
    ensureNote: vi.fn(),
    createNotelet: vi.fn(),
    ...overrides,
  } as unknown as JournalsApi;
}

function register(api: JournalsApi): RecordedRoute[] {
  const recorded: RecordedRoute[] = [];
  registerJournalRoutes(fakeAddRoute(recorded), api);
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
    expect(paths).toEqual([
      "/journals/",
      "/journals/:name/",
      "/journals/:name/notes",
      "/journals/:name/notes/:date",
      "/journals/:name/notelets/:date",
    ]);
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
      expect(response.body).toMatchObject({ code: "journal-not-found" });
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

    it("gives 404 for an unknown journal", async () => {
      const api = fakeApi({ journalInfo: vi.fn().mockResolvedValue(null) });
      const recorded = register(api);
      const response = fakeResponse();

      await invoke(
        findRoute(recorded, "/journals/:name/notes", "get"),
        fakeRequest({ params: { name: "nope" } }),
        response,
      );

      expect(response.statusCode).toBe(404);
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

    it("treats a missing body as {} answers", async () => {
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
        answers: {},
      });
    });

    it("treats a Buffer body as {} answers", async () => {
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
        answers: {},
      });
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
      const api = fakeApi({ createNotelet });
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

    it("gives 400 invalid-request when type is not a string", async () => {
      const createNotelet = vi.fn();
      const api = fakeApi({ createNotelet });
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

    it("returns 201 and calls createNotelet with prompt: false and the answers, no confirm/openMode", async () => {
      const createNotelet = vi.fn().mockResolvedValue(createdNotelet());
      const api = fakeApi({ createNotelet });
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
      expect(createNotelet).toHaveBeenCalledWith("work", "2026-08-18", "mood", {
        prompt: false,
        answers: { mood: "good" },
      });
    });
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
