import { describe, expect, it, vi } from "vitest";

import { restHarness } from "../testing";

describe("GET /journals/", () => {
  it("returns the journal list", async () => {
    const { api, send } = await restHarness();

    const response = await send("get", "/journals/");

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ journals: await api.listJournals() });
    expect(response.body).toMatchObject({ journals: [{ name: "work" }] });
  });

  it("maps a rejection to the error response", async () => {
    const { api, send } = await restHarness();
    vi.spyOn(api, "listJournals").mockRejectedValue(new Error("boom"));

    const response = await send("get", "/journals/");

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ code: "internal-error", message: "boom" });
  });
});
