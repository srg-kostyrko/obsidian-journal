import { describe, expect, it, vi } from "vitest";

import { fakeRequest, restHarness } from "../testing";

const unattended = { prompt: false, confirm: false } as const;
const path = "/journals/:name/notes/:date/:direction";

describe("GET /journals/:name/notes/:date/:direction", () => {
  it("answers the nearest earlier note for previous, across a gap", async () => {
    const { api, send } = await restHarness();
    await api.ensureNote("work", "2026-08-10", unattended);
    await api.ensureNote("work", "2026-08-18", unattended);

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-08-25", direction: "previous" } }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      note: {
        journal: "work",
        date: "2026-08-18",
        displayDate: "2026-08-18",
        endDate: "2026-08-18",
        path: "2026-08-18.md",
        exists: true,
      },
    });
  });

  it("answers the nearest later note for next", async () => {
    const { api, send } = await restHarness();
    await api.ensureNote("work", "2026-08-10", unattended);
    await api.ensureNote("work", "2026-08-18", unattended);

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-08-10", direction: "next" } }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ note: { date: "2026-08-18" } });
  });

  it("answers a null note, not a 404, when there is no neighbor", async () => {
    const { send } = await restHarness();

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-08-18", direction: "previous" } }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ note: null });
  });

  it("gives 400 invalid-request for a direction that is neither previous nor next", async () => {
    const { api, send } = await restHarness();
    const previousNote = vi.spyOn(api, "previousNote");
    const nextNote = vi.spyOn(api, "nextNote");

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "2026-08-18", direction: "sideways" } }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-request" });
    expect(previousNote).not.toHaveBeenCalled();
    expect(nextNote).not.toHaveBeenCalled();
  });

  it("gives 400 invalid-date for a date it cannot read", async () => {
    const { send } = await restHarness();

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "work", date: "whenever", direction: "next" } }),
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ code: "invalid-date" });
  });

  it("gives 404 for an unknown journal without looking for a neighbor", async () => {
    const { api, send } = await restHarness();
    const previousNote = vi.spyOn(api, "previousNote");

    const response = await send(
      "get",
      path,
      fakeRequest({ params: { name: "nope", date: "2026-08-18", direction: "previous" } }),
    );

    expect(response.statusCode).toBe(404);
    expect(previousNote).not.toHaveBeenCalled();
  });
});
