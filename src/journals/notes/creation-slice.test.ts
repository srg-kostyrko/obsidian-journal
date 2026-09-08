import { describe, expect, it } from "vitest";

import { creationAllowedOn } from "./creation-slice";

describe("creationAllowedOn", () => {
  it("allows both devices by default", () => {
    expect(creationAllowedOn("all", "desktop")).toBe(true);
    expect(creationAllowedOn("all", "mobile")).toBe(true);
  });

  it("allows only the desktop when the rule names it", () => {
    expect(creationAllowedOn("desktop", "desktop")).toBe(true);
    expect(creationAllowedOn("desktop", "mobile")).toBe(false);
  });

  it("allows only the mobile app when the rule names it", () => {
    expect(creationAllowedOn("mobile", "mobile")).toBe(true);
    expect(creationAllowedOn("mobile", "desktop")).toBe(false);
  });
});
