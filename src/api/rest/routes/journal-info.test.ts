import { describe, expect, it } from "vitest";

import { fakeRequest, restHarness } from "../testing";

describe("GET /journals/:name/", () => {
  it("returns the journal's info", async () => {
    const { api, send } = await restHarness();

    const response = await send("get", "/journals/:name/", fakeRequest({ params: { name: "work" } }));

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(await api.journalInfo("work"));
    expect(response.body).toMatchObject({ name: "work" });
  });

  it("gives 404 journal-not-found for an unknown journal", async () => {
    const { send } = await restHarness();

    const response = await send("get", "/journals/:name/", fakeRequest({ params: { name: "nope" } }));

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      code: "journal-not-found",
      message: "Journal not found: nope",
      journal: "nope",
    });
  });
});
