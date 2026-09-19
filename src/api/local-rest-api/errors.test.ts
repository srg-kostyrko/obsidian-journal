import { describe, expect, it } from "vitest";

import { errorBody, sendError, statusFor } from "./errors";
import { fakeResponse } from "./testing";

describe("errorBody", () => {
  it("carries code, message, journal and issues from a coded error", () => {
    const error = Object.assign(new Error("bad answers"), {
      code: "invalid-answers",
      journal: "work",
      issues: [{ variable: "mood", reason: "required" }],
    });
    expect(errorBody(error)).toEqual({
      code: "invalid-answers",
      message: "bad answers",
      journal: "work",
      issues: [{ variable: "mood", reason: "required" }],
    });
  });

  it("reports an uncoded error as internal-error with its message", () => {
    expect(errorBody(new Error("boom"))).toEqual({ code: "internal-error", message: "boom" });
  });

  it("falls back to the code when a coded error has no message", () => {
    expect(errorBody({ code: "note-not-found" })).toEqual({ code: "note-not-found", message: "note-not-found" });
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
