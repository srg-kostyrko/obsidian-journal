import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import { NoteNotFoundError, NoteWriteError, type VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalNotFoundError } from "@/journals/errors";
import { JournalsIndex } from "@/journals/journals-index";
import { NoteCreationService } from "@/journals/notes/note-creation";
import type { Prompt } from "@/journals/prompts/config";
import { fixedJournal } from "@/journals/testing";

import { fakeRequest, fakeResponse, restHarness, type RestHarness } from "../testing";

import type { Request } from "express";

const PLAIN = "/journals/:name/:date";
const WILDCARD = "/journals/:name/:date/*";
const VERBS = ["get", "put", "post", "patch", "delete"] as const;

const requiredMood: Prompt = {
  variable: "mood",
  question: "Mood?",
  type: "text",
  frontmatterKey: "mood",
  required: true,
};

// A note already on disk and connected to `work` at 2026-08-18, at a path of the test's choosing.
function seedNote(rest: RestHarness, path: string): void {
  rest.harness.host.putFile(path, "existing");
  rest.harness.resolve(JournalsIndex).register({
    journalName: "work",
    anchor: "2026-08-18" as AnchorString,
    path: path as VaultPath,
  });
}

const CARRIES_BODY: Readonly<Record<string, string>> = { "content-length": "1" };

function putRequest(body: unknown, headers: Readonly<Record<string, string>> = CARRIES_BODY): Request {
  return fakeRequest({
    params: { name: "work", date: "2026-08-18" },
    method: "PUT",
    body,
    headers: { ...headers },
    path: "/journals/work/2026-08-18",
  });
}

describe("the redirect family (/journals/:name/:date and /journals/:name/:date/*)", () => {
  describe("GET and DELETE: resolve an existing note, never create", () => {
    it.each(["get", "delete"] as const)(
      "%s redirects 307 to the encoded vault path of an existing note",
      async (method) => {
        const rest = await restHarness();
        seedNote(rest, "Journal/Día 1.md");
        const notesFor = vi.spyOn(rest.api, "notesFor");
        const ensureNote = vi.spyOn(rest.api, "ensureNote");

        const response = await rest.send(
          method,
          PLAIN,
          fakeRequest({ params: { name: "work", date: "2026-08-18" }, method }),
        );

        expect(notesFor).toHaveBeenCalledWith("work", "2026-08-18");
        expect(response.redirected).toEqual({ status: 307, url: "/vault/Journal/D%C3%ADa%201.md" });
        expect(response.headers["Content-Location"]).toBe(encodeURI("Journal/Día 1.md"));
        expect(ensureNote).not.toHaveBeenCalled();
      },
    );

    it("appends an encoded heading suffix from the wildcard path", async () => {
      const rest = await restHarness();
      seedNote(rest, "work/2026-08-18.md");

      const response = await rest.send(
        "get",
        WILDCARD,
        fakeRequest({
          params: { name: "work", date: "2026-08-18", 0: "Tasks/Sub" },
          path: "/journals/work/2026-08-18/Tasks/Sub",
        }),
      );

      expect(response.redirected).toEqual({ status: 307, url: "/vault/work/2026-08-18.md/Tasks/Sub" });
      expect(response.headers["Content-Location"]).toBe("work/2026-08-18.md/Tasks/Sub");
    });

    it("round-trips a heading segment carrying an encoded slash (%2F) as one segment, not two", async () => {
      // Express would decode req.params[0] to "heading/A/B" for this request, collapsing the
      // encoded %2F into a segment boundary indistinguishable from the real one before it — that
      // is exactly the bug this recovers from by reading req.path (still encoded) instead.
      const rest = await restHarness();
      seedNote(rest, "work/2026-08-18.md");

      const response = await rest.send(
        "get",
        WILDCARD,
        fakeRequest({
          params: { name: "work", date: "2026-08-18", 0: "heading/A/B" },
          path: "/journals/work/2026-08-18/heading/A%2FB",
        }),
      );

      expect(response.redirected).toEqual({ status: 307, url: "/vault/work/2026-08-18.md/heading/A%2FB" });
    });

    it("forwards the request's whole query string onto the Location", async () => {
      const rest = await restHarness();
      seedNote(rest, "work/2026-08-18.md");

      const response = await rest.send(
        "delete",
        WILDCARD,
        fakeRequest({
          params: { name: "work", date: "2026-08-18", 0: "Tasks" },
          method: "DELETE",
          path: "/journals/work/2026-08-18/Tasks",
          originalUrl: "/journals/work/2026-08-18/Tasks?permanent=true&other=a%20b",
        }),
      );

      expect(response.redirected).toEqual({
        status: 307,
        url: "/vault/work/2026-08-18.md/Tasks?permanent=true&other=a%20b",
      });
      expect(response.headers["Content-Location"]).toBe("work/2026-08-18.md/Tasks");
    });

    it("gives 400 invalid-request when a suffix segment is a malformed percent-encoding", async () => {
      const rest = await restHarness();
      const notesFor = vi.spyOn(rest.api, "notesFor");

      const response = await rest.send(
        "get",
        WILDCARD,
        fakeRequest({ params: { name: "work", date: "2026-08-18", 0: "%" }, path: "/journals/work/2026-08-18/%" }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-request" });
      expect(notesFor).not.toHaveBeenCalled();
    });

    it.each(["..", "."])("gives 400 invalid-request when a suffix segment decodes to %s", async (segment) => {
      const rest = await restHarness();
      const notesFor = vi.spyOn(rest.api, "notesFor");

      const response = await rest.send(
        "get",
        WILDCARD,
        fakeRequest({
          params: { name: "work", date: "2026-08-18", 0: segment },
          path: `/journals/work/2026-08-18/${segment}`,
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-request" });
      expect(notesFor).not.toHaveBeenCalled();
    });

    it("gives 400 invalid-request when a percent-encoded suffix segment decodes to ..", async () => {
      const rest = await restHarness();
      const notesFor = vi.spyOn(rest.api, "notesFor");

      const response = await rest.send(
        "get",
        WILDCARD,
        fakeRequest({
          params: { name: "work", date: "2026-08-18", 0: ".." },
          path: "/journals/work/2026-08-18/%2e%2e",
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-request" });
      expect(notesFor).not.toHaveBeenCalled();
    });

    it("gives 400 invalid-date when the date is invalid, over the redirect family", async () => {
      const rest = await restHarness();

      const response = await rest.send("get", PLAIN, fakeRequest({ params: { name: "work", date: "not-a-date" } }));

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({ code: "invalid-date" });
    });

    it.each(["get", "delete"] as const)(
      "%s gives 404 note-not-found when no note exists, without calling ensureNote",
      async (method) => {
        const rest = await restHarness();
        const ensureNote = vi.spyOn(rest.api, "ensureNote");

        const response = await rest.send(
          method,
          PLAIN,
          fakeRequest({ params: { name: "work", date: "2026-08-18" }, method }),
        );

        expect(response.statusCode).toBe(404);
        expect(response.body).toMatchObject({ code: "note-not-found" });
        expect(ensureNote).not.toHaveBeenCalled();
        expect(rest.harness.host.files.has("2026-08-18.md")).toBe(false);
      },
    );

    it("gives 404 note-not-found when no journal period answers for the date", async () => {
      const rest = await restHarness();
      vi.spyOn(rest.api, "notesFor").mockResolvedValue([]);

      const response = await rest.send("get", PLAIN, fakeRequest({ params: { name: "work", date: "2026-08-18" } }));

      expect(response.statusCode).toBe(404);
      expect(response.body).toMatchObject({ code: "note-not-found" });
    });

    it("gives 404 note-not-found for a period with no path, outside the journal's timeline", async () => {
      const rest = await restHarness({
        work: fixedJournal(
          "work",
          { type: "day" },
          {
            timeline: {
              start: "2026-08-19" as AnchorString,
              end: { kind: "date", date: "2026-12-31" as AnchorString },
            },
          },
        ),
      });

      const response = await rest.send("get", PLAIN, fakeRequest({ params: { name: "work", date: "2026-08-18" } }));

      expect(await rest.api.notesFor("work", "2026-08-18")).toMatchObject([{ path: null, file: null }]);
      expect(response.statusCode).toBe(404);
      expect(response.body).toMatchObject({ code: "note-not-found" });
    });
  });

  describe("PUT, POST and PATCH: ensure the note exists first, then redirect", () => {
    it.each(["post", "patch"] as const)(
      "%s calls ensureNote with prompt: false, confirm: false, then redirects to its path",
      async (method) => {
        const rest = await restHarness();
        const ensureNote = vi.spyOn(rest.api, "ensureNote");
        let existedAtRedirect: boolean | undefined;
        const response = fakeResponse(() => {
          existedAtRedirect = rest.harness.host.files.has("2026-08-18.md");
        });

        await rest.send(method, PLAIN, fakeRequest({ params: { name: "work", date: "2026-08-18" }, method }), response);

        expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", { prompt: false, confirm: false });
        expect(response.redirected).toEqual({ status: 307, url: "/vault/2026-08-18.md" });
        expect(existedAtRedirect).toBe(true);
      },
    );

    it.each([
      [PLAIN, "/journals/work/2026-08-18"],
      [WILDCARD, "/journals/work/2026-08-18/Tasks"],
    ])(
      "wraps a prompts-required rejection on PUT %s with a message pointing at the notes endpoint",
      async (route, path) => {
        const rest = await restHarness({ work: fixedJournal("work", { type: "day" }, { prompts: [requiredMood] }) });

        const response = await rest.send(
          "put",
          route,
          fakeRequest({
            params: { name: "work", date: "2026-08-18" },
            path,
            method: "PUT",
            body: "body",
            headers: { ...CARRIES_BODY },
          }),
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
      const rest = await restHarness();
      const ensureNote = vi.spyOn(rest.api, "ensureNote");

      const response = await rest.send(
        "put",
        WILDCARD,
        fakeRequest({
          params: { name: "work", date: "2026-08-18", 0: "Tasks/Sub" },
          path: "/journals/work/2026-08-18/Tasks/Sub",
          method: "put",
        }),
      );

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", { prompt: false, confirm: false });
      expect(response.redirected).toEqual({ status: 307, url: "/vault/2026-08-18.md/Tasks/Sub" });
    });
  });

  describe("PUT without a suffix: replace the whole note, keeping its journal claim", () => {
    it("ensures the note, replaces its content with the body, then answers 204 with no body", async () => {
      const rest = await restHarness();
      const ensureNote = vi.spyOn(rest.api, "ensureNote");
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");

      const response = await rest.send("put", PLAIN, putRequest("# New body\n"));

      expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", { prompt: false, confirm: false });
      expect(replaceContent).toHaveBeenCalledWith("work", "2026-08-18", "# New body\n");
      expect(ensureNote.mock.invocationCallOrder[0]).toBeLessThan(replaceContent.mock.invocationCallOrder[0] ?? 0);
      expect(rest.harness.host.files.get("2026-08-18.md")?.content).toMatch(/\n# New body\n$/);
      expect(response.statusCode).toBe(204);
      expect(response.ended).toBe(true);
      expect(response.body).toBeUndefined();
      expect(response.redirected).toBeUndefined();
    });

    it("replaces with the note's own date, not the date the request named", async () => {
      const rest = await restHarness({ work: fixedJournal("work", { type: "week" }) });
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");

      await rest.send(
        "put",
        PLAIN,
        fakeRequest({
          params: { name: "work", date: "2026-08-19" },
          method: "PUT",
          body: "body",
          headers: { ...CARRIES_BODY },
        }),
      );

      expect(replaceContent).toHaveBeenCalledWith("work", "2026-08-17", "body");
    });

    it("decodes a byte body as UTF-8", async () => {
      const rest = await restHarness();
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");

      const response = await rest.send("put", PLAIN, putRequest(new TextEncoder().encode("Café ✓")));

      expect(replaceContent).toHaveBeenCalledWith("work", "2026-08-18", "Café ✓");
      expect(response.statusCode).toBe(204);
    });

    it.each([
      ["an empty body the host left as {}", {}, { "content-length": "0" }],
      ["no body at all", undefined, {}],
    ])("clears the note for %s", async (_label, body, headers) => {
      const rest = await restHarness();
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");

      const response = await rest.send("put", PLAIN, putRequest(body, headers));

      expect(replaceContent).toHaveBeenCalledWith("work", "2026-08-18", "");
      expect(response.statusCode).toBe(204);
    });

    it.each([
      ["a parsed JSON object", { content: "x" }],
      ["an empty JSON object", {}],
    ])("gives 400 invalid-request for %s, before creating anything", async (_label, body) => {
      const rest = await restHarness();
      const ensureNote = vi.spyOn(rest.api, "ensureNote");
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");

      const response = await rest.send("put", PLAIN, putRequest(body));

      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({
        code: "invalid-request",
        message: expect.stringContaining("Content-Type: text/markdown") as unknown,
      });
      expect(ensureNote).not.toHaveBeenCalled();
      expect(replaceContent).not.toHaveBeenCalled();
    });

    it("answers 400 invalid-request before creating anything when the body's frontmatter cannot be read", async () => {
      const rest = await restHarness();
      const checkContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "checkContent");
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");
      const ensureNote = vi.spyOn(rest.api, "ensureNote");

      const response = await rest.send("put", PLAIN, putRequest("---\ntags: [x\n---\nbody"));

      expect(checkContent).toHaveBeenCalledWith("---\ntags: [x\n---\nbody");
      expect(response.statusCode).toBe(400);
      expect(response.body).toMatchObject({
        code: "invalid-request",
        journal: "work",
        message: expect.stringContaining("frontmatter") as unknown,
      });
      expect(ensureNote).not.toHaveBeenCalled();
      expect(replaceContent).not.toHaveBeenCalled();
      expect(rest.harness.host.files.get("2026-08-18.md")).toBeUndefined();
    });

    it("gives 404 for an unknown journal without touching content", async () => {
      const rest = await restHarness();
      const replaceContent = vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent");

      const response = await rest.send(
        "put",
        PLAIN,
        fakeRequest({
          params: { name: "nope", date: "2026-08-18" },
          method: "PUT",
          body: "body",
          headers: { ...CARRIES_BODY },
        }),
      );

      expect(response.statusCode).toBe(404);
      expect(replaceContent).not.toHaveBeenCalled();
    });

    it.each([
      ["journal-not-found", 404, new JournalNotFoundError("work")],
      ["note-not-found", 404, new NoteNotFoundError("2026-08-18.md" as VaultPath)],
      ["write-failed", 500, new NoteWriteError("2026-08-18.md" as VaultPath, new Error("disk full"))],
    ])("maps a %s failure to %i", async (code, expected, error) => {
      const rest = await restHarness();
      vi.spyOn(rest.harness.resolve(NoteCreationService), "replaceContent").mockReturnValue(AsyncResult.err(error));

      const response = await rest.send("put", PLAIN, putRequest("new body"));

      expect(response.statusCode).toBe(expected);
      expect(response.body).toMatchObject({ code, journal: "work" });
    });
  });

  it.each(VERBS)("%s gives 404 for an unknown journal", async (method) => {
    const rest = await restHarness();
    const notesFor = vi.spyOn(rest.api, "notesFor");
    const ensureNote = vi.spyOn(rest.api, "ensureNote");

    const response = await rest.send(
      method,
      PLAIN,
      fakeRequest({ params: { name: "nope", date: "2026-08-18" }, method }),
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ code: "journal-not-found" });
    expect(notesFor).not.toHaveBeenCalled();
    expect(ensureNote).not.toHaveBeenCalled();
  });

  it.each(VERBS)("%s gives 404 for an unknown journal on the wildcard path", async (method) => {
    const rest = await restHarness();
    const notesFor = vi.spyOn(rest.api, "notesFor");
    const ensureNote = vi.spyOn(rest.api, "ensureNote");

    const response = await rest.send(
      method,
      WILDCARD,
      fakeRequest({ params: { name: "nope", date: "2026-08-18", 0: "" }, path: "/journals/nope/2026-08-18/", method }),
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ code: "journal-not-found" });
    expect(notesFor).not.toHaveBeenCalled();
    expect(ensureNote).not.toHaveBeenCalled();
  });
});
