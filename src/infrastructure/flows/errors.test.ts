import { describe, expect, it } from "vitest";

import { UserAborted } from "./errors";

describe("UserAborted", () => {
  it("exposes the source field", () => {
    expect(new UserAborted("journal-picker").source).toBe("journal-picker");
  });

  it("includes the source in the error message", () => {
    expect(new UserAborted("journal-picker").message).toBe("User aborted at journal-picker");
  });

  it("uses 'user-aborted' as its kind discriminant", () => {
    expect(new UserAborted("journal-picker").kind).toBe("user-aborted");
  });
});
