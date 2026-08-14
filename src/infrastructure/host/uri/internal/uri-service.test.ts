import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";

import { createFakeHost } from "../../internal/testing";
import { InternalPluginToken } from "../../internal/tokens";

import { UriService } from "./uri-service";

function build() {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(UriService).useClass(UriService);
  return { service: c.resolve(UriService), host };
}

describe("UriService", () => {
  it("forwards the protocol params to the handler", () => {
    const { service, host } = build();
    const handler = vi.fn();
    service.register("journals", handler);
    host.emitProtocol("journals", { action: "journals", journal: "Daily" });
    expect(handler).toHaveBeenCalledWith({ action: "journals", journal: "Daily" });
  });
});
