import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { MetadataTypeService } from "./metadata-type-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken } from "./tokens";

import type { App } from "obsidian";

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
    const { service, host } = build();
    host.setPropertyType("rating", "number");
    expect(service.getPropertyType("unknown")).toBeNull();
  });

  it("prefers the type assigned in Obsidian's property settings over the inferred one", () => {
    const { service, host } = build();
    host.setPropertyType("rating", "text");
    host.assignPropertyType("rating", "number");
    expect(service.getPropertyType("rating")).toBe("number");
  });

  it("lists every property the vault has seen with its type", () => {
    const { service, host } = build();
    host.setPropertyType("Rating", "number");
    host.setPropertyType("Due", "date");
    expect(service.listProperties().toSorted((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "Due", type: "date" },
      { name: "Rating", type: "number" },
    ]);
  });

  it("lists no properties when the vault registry is unavailable", () => {
    const c = new Container();
    c.register(InternalObsidianAppToken).useValue({} as App);
    c.register(MetadataTypeService).useClass(MetadataTypeService);
    expect(c.resolve(MetadataTypeService).listProperties()).toEqual([]);
  });
});
