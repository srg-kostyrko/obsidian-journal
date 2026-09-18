import { describe, expect, it, vi } from "vitest";

import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";

import { fakeRequest, restHarness } from "../testing";

const unattended = { prompt: false, confirm: false } as const;

function journalWithMood() {
  return {
    work: fixedJournal(
      "work",
      { type: "day" },
      { notelets: { nt_mood: buildNoteletType({ id: "nt_mood" as TypeId, name: "mood" }) } },
    ),
  };
}

describe("GET /journals/:name/notes", () => {
  it("reads both notes and notelets when from and to are both given", async () => {
    const { api, send } = await restHarness(journalWithMood());
    await api.ensureNote("work", "2026-08-18", unattended);
    const notelet = await api.createNotelet("work", "2026-08-18", "mood", unattended);
    const existingNotes = vi.spyOn(api, "existingNotes");
    const noteletsInRange = vi.spyOn(api, "noteletsInRange");

    const response = await send(
      "get",
      "/journals/:name/notes",
      fakeRequest({ params: { name: "work" }, query: { from: "2026-08-01", to: "2026-08-31", type: "mood" } }),
    );

    expect(response.statusCode).toBe(200);
    expect(existingNotes).toHaveBeenCalledWith("work", { from: "2026-08-01", to: "2026-08-31" });
    expect(noteletsInRange).toHaveBeenCalledWith("work", { from: "2026-08-01", to: "2026-08-31" }, { type: "mood" });
    expect(response.body).toMatchObject({
      notes: [{ path: "2026-08-18.md", exists: true }],
      notelets: [{ path: notelet.path, type: "mood", counter: 1 }],
    });
  });

  it("answers only notes, unbounded, when from/to are omitted", async () => {
    const { api, send } = await restHarness();
    await api.ensureNote("work", "2026-08-18", unattended);
    const existingNotes = vi.spyOn(api, "existingNotes");
    const noteletsInRange = vi.spyOn(api, "noteletsInRange");

    const response = await send("get", "/journals/:name/notes", fakeRequest({ params: { name: "work" } }));

    expect(response.statusCode).toBe(200);
    expect(existingNotes).toHaveBeenCalledWith("work");
    expect(noteletsInRange).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({ notes: [{ path: "2026-08-18.md" }], notelets: [] });
  });

  it("gives 400 invalid-request when only from is given", async () => {
    const { send } = await restHarness();

    const response = await send(
      "get",
      "/journals/:name/notes",
      fakeRequest({ params: { name: "work" }, query: { from: "2026-08-01" } }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-request" });
  });

  it("gives 400 invalid-request when a query param arrives as an array, not a string", async () => {
    const { send } = await restHarness();

    const response = await send(
      "get",
      "/journals/:name/notes",
      // Express/qs parses a repeated key (?from=a&from=b) into an array.
      fakeRequest({ params: { name: "work" }, query: { from: ["2026-08-01", "2026-08-02"], to: "2026-08-31" } }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-request" });
  });

  it("gives 404 for an unknown journal without reading any notes or notelets", async () => {
    const { api, send } = await restHarness();
    const existingNotes = vi.spyOn(api, "existingNotes");
    const noteletsInRange = vi.spyOn(api, "noteletsInRange");

    const response = await send("get", "/journals/:name/notes", fakeRequest({ params: { name: "nope" } }));

    expect(response.statusCode).toBe(404);
    expect(existingNotes).not.toHaveBeenCalled();
    expect(noteletsInRange).not.toHaveBeenCalled();
  });

  it("never puts a file key anywhere in the response", async () => {
    const { api, send } = await restHarness(journalWithMood());
    await api.ensureNote("work", "2026-08-18", unattended);
    await api.createNotelet("work", "2026-08-18", "mood", unattended);

    const response = await send(
      "get",
      "/journals/:name/notes",
      fakeRequest({ params: { name: "work" }, query: { from: "2026-08-01", to: "2026-08-31" } }),
    );

    expect(response.body).toMatchObject({ notes: [{}], notelets: [{}] });
    expect(JSON.stringify(response.body)).not.toContain('"file"');
  });
});
