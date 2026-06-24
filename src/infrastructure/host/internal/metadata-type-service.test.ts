import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { MetadataTypeService } from "./metadata-type-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken } from "./tokens";

function build(): { service: MetadataTypeService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(MetadataTypeService).useClass(MetadataTypeService);
  return { service: c.resolve(MetadataTypeService), host };
}

describe("MetadataTypeService", () => {
  it("returns the registered type for a known property", () => {
    const { service, host } = build();
    host.setPropertyType("rating", "number");
    expect(service.getPropertyType("rating")).toBe("number");
  });

  it("looks properties up case-insensitively", () => {
    const { service, host } = build();
    host.setPropertyType("due", "date");
    expect(service.getPropertyType("DUE")).toBe("date");
  });

  it("returns null for a property the vault has never seen", () => {
    const { service } = build();
    expect(service.getPropertyType("unknown")).toBeNull();
  });
});
