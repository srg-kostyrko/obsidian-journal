import { describe, expect, it, vi } from "vitest";

import type { Prompt } from "@/journals/prompts/config";
import { fixedJournal } from "@/journals/testing";

import { fakeRequest, restHarness } from "../testing";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

function journalAsking(prompt: Prompt) {
  return { work: fixedJournal("work", { type: "day" }, { prompts: [prompt] }) };
}

const createRequest = (overrides: Parameters<typeof fakeRequest>[0] = {}) =>
  fakeRequest({ params: { name: "work", date: "2026-08-18" }, ...overrides });

describe("POST /journals/:name/notes/:date", () => {
  it("returns 201 with created: true when ensureNote creates the note", async () => {
    const { harness, send } = await restHarness();

    const response = await send("post", "/journals/:name/notes/:date", createRequest());

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({ created: true, path: "2026-08-18.md" });
    expect(JSON.stringify(response.body)).not.toContain('"file"');
    expect(harness.host.files.has("2026-08-18.md")).toBe(true);
  });

  it("returns 200 with created: false when the note already exists", async () => {
    const { api, send } = await restHarness();
    await api.ensureNote("work", "2026-08-18", { prompt: false, confirm: false });

    const response = await send("post", "/journals/:name/notes/:date", createRequest());

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ created: false });
  });

  it("calls ensureNote with prompt: false, confirm: false and the body's answers", async () => {
    const { api, harness, send } = await restHarness(journalAsking(mood));
    const ensureNote = vi.spyOn(api, "ensureNote");

    await send("post", "/journals/:name/notes/:date", createRequest({ body: { answers: { mood: "good" } } }));

    expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
      prompt: false,
      confirm: false,
      answers: { mood: "good" },
    });
    expect(harness.host.files.get("2026-08-18.md")?.frontmatter).toMatchObject({ mood: "good" });
  });

  it("treats a missing body as undefined answers", async () => {
    const { api, send } = await restHarness();
    const ensureNote = vi.spyOn(api, "ensureNote");

    await send("post", "/journals/:name/notes/:date", createRequest());

    expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
      prompt: false,
      confirm: false,
      answers: undefined,
    });
  });

  it("treats a Buffer body as undefined answers", async () => {
    const { api, send } = await restHarness();
    const ensureNote = vi.spyOn(api, "ensureNote");
    // A stand-in for what the host hands over on a non-JSON content type: an object whose
    // prototype is not Object.prototype, the same shape a real Buffer has.
    const bufferLike = Object.create({ constructor: { name: "Buffer" } }) as unknown;

    await send("post", "/journals/:name/notes/:date", createRequest({ body: bufferLike }));

    expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
      prompt: false,
      confirm: false,
      answers: undefined,
    });
  });

  it("forwards a non-object answers value unchanged, letting the API reject it", async () => {
    const { api, send } = await restHarness();
    const ensureNote = vi.spyOn(api, "ensureNote");

    const response = await send("post", "/journals/:name/notes/:date", createRequest({ body: { answers: "x" } }));

    expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
      prompt: false,
      confirm: false,
      answers: "x",
    });
    expect(response.body).toMatchObject({ code: "invalid-answers" });
  });

  it("surfaces the API's prompts-required as 409 when no answers were sent to a required question", async () => {
    const { api, send } = await restHarness(journalAsking({ ...mood, required: true }));
    const ensureNote = vi.spyOn(api, "ensureNote");

    const response = await send("post", "/journals/:name/notes/:date", createRequest());

    expect(ensureNote).toHaveBeenCalledWith("work", "2026-08-18", {
      prompt: false,
      confirm: false,
      answers: undefined,
    });
    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({ code: "prompts-required", journal: "work" });
  });

  it("gives 404 for an unknown journal", async () => {
    const { api, send } = await restHarness();
    const ensureNote = vi.spyOn(api, "ensureNote");

    const response = await send(
      "post",
      "/journals/:name/notes/:date",
      fakeRequest({ params: { name: "nope", date: "2026-08-18" } }),
    );

    expect(response.statusCode).toBe(404);
    expect(ensureNote).not.toHaveBeenCalled();
  });

  describe("error mapping", () => {
    it("maps an invalid-answers rejection to 400 with the exact body", async () => {
      const { api, send } = await restHarness();
      const issues = [{ variable: "mood", reason: "required" }];
      const error = Object.assign(new Error("Invalid answers for work"), {
        code: "invalid-answers",
        journal: "work",
        issues,
      });
      vi.spyOn(api, "ensureNote").mockRejectedValue(error);

      const response = await send("post", "/journals/:name/notes/:date", createRequest());

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({
        code: "invalid-answers",
        message: "Invalid answers for work",
        journal: "work",
        issues,
      });
    });

    it("maps an unmappable-date rejection to 422", async () => {
      const { api, send } = await restHarness();
      const error = Object.assign(new Error("cannot map the date"), { code: "unmappable-date" });
      vi.spyOn(api, "ensureNote").mockRejectedValue(error);

      const response = await send("post", "/journals/:name/notes/:date", createRequest());

      expect(response.statusCode).toBe(422);
    });

    it("maps a plain Error to 500 internal-error", async () => {
      const { api, send } = await restHarness();
      vi.spyOn(api, "ensureNote").mockRejectedValue(new Error("boom"));

      const response = await send("post", "/journals/:name/notes/:date", createRequest());

      expect(response.statusCode).toBe(500);
      expect(response.body).toEqual({ code: "internal-error", message: "boom" });
    });
  });
});
