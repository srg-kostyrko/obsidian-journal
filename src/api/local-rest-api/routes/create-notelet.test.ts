import { describe, expect, it, vi } from "vitest";

import type { TypeId } from "@/journals/notelets/config";
import type { Prompt } from "@/journals/prompts/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";

import { fakeRequest, restHarness } from "../testing";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

const journals = {
  work: fixedJournal(
    "work",
    { type: "day" },
    { notelets: { nt_mood: buildNoteletType({ id: "nt_mood" as TypeId, name: "mood", prompts: [mood] }) } },
  ),
};

const noteletRequest = (overrides: Parameters<typeof fakeRequest>[0] = {}) =>
  fakeRequest({ params: { name: "work", date: "2026-08-18" }, ...overrides });

describe("POST /journals/:name/notelets/:date", () => {
  it("gives 400 invalid-request when type is missing", async () => {
    const { api, send } = await restHarness(journals);
    const createNotelet = vi.spyOn(api, "createNotelet");

    const response = await send("post", "/journals/:name/notelets/:date", noteletRequest({ body: {} }));

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-request" });
    expect(createNotelet).not.toHaveBeenCalled();
  });

  it("mentions Content-Type: application/json when the body never parsed as JSON", async () => {
    const { send } = await restHarness(journals);

    const response = await send("post", "/journals/:name/notelets/:date", noteletRequest());

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({
      code: "invalid-request",
      message: expect.stringContaining("Content-Type: application/json") as unknown,
    });
  });

  it("gives 400 invalid-request when type is not a string", async () => {
    const { api, send } = await restHarness(journals);
    const createNotelet = vi.spyOn(api, "createNotelet");

    const response = await send("post", "/journals/:name/notelets/:date", noteletRequest({ body: { type: 42 } }));

    expect(response.statusCode).toBe(400);
    expect(createNotelet).not.toHaveBeenCalled();
  });

  it("gives 404 for an unknown journal before validating the body", async () => {
    const { api, send } = await restHarness(journals);
    const createNotelet = vi.spyOn(api, "createNotelet");

    const response = await send(
      "post",
      "/journals/:name/notelets/:date",
      // No type in the body either — the 404 must still win.
      fakeRequest({ params: { name: "nope", date: "2026-08-18" }, body: {} }),
    );

    expect(response.statusCode).toBe(404);
    expect(createNotelet).not.toHaveBeenCalled();
  });

  it("returns 201, no file key, and calls createNotelet with prompt: false, confirm: false and the answers", async () => {
    const { api, harness, send } = await restHarness(journals);
    const createNotelet = vi.spyOn(api, "createNotelet");

    const response = await send(
      "post",
      "/journals/:name/notelets/:date",
      noteletRequest({ body: { type: "mood", answers: { mood: "good" } } }),
    );

    expect(response.statusCode).toBe(201);
    expect(response.body).toMatchObject({ type: "mood", date: "2026-08-18", counter: 1 });
    expect(JSON.stringify(response.body)).not.toContain('"file"');
    expect(createNotelet).toHaveBeenCalledWith("work", "2026-08-18", "mood", {
      prompt: false,
      confirm: false,
      answers: { mood: "good" },
    });
    const { path } = response.body as { path: string };
    expect(harness.host.files.get(path)?.frontmatter).toMatchObject({ mood: "good" });
  });
});
