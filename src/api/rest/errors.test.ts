import { describe, expect, it } from "vitest";

import { sendError, statusFor } from "./errors";
import { fakeResponse } from "./testing";

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
