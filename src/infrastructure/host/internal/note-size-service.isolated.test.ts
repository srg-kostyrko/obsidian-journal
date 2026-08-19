import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";

import { NoteSizeService } from "./note-size-service";
import { NotesService } from "./notes-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken, InternalPluginToken } from "./tokens";

import type { VaultPath } from "../types";

// tsconfig.app.json has no "node" types; the test process itself always has this.
declare const process: {
  on(event: "unhandledRejection", handler: (reason: unknown) => void): void;
  off(event: "unhandledRejection", handler: (reason: unknown) => void): void;
};

function build(): { service: NoteSizeService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(createLoggerTestingModule().module);
  c.register(NotesService).useClass(NotesService);
  c.register(NoteSizeService).useClass(NoteSizeService);
  return { service: c.resolve(NoteSizeService), host };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("NoteSizeService", () => {
  it("does not reject when a size-changed subscriber throws", async () => {
    // #fill is a floating promise, so a throwing subscriber must not escape it. An
    // unhandled rejection is the ONLY observable that distinguishes a bare try/finally
    // from a real catch — #pending is cleaned up either way — and it fires on a
    // macrotask, so a microtask settle() is not enough to see it. process.on(
    // "unhandledRejection") is process-global, and the shared unit-suite project runs
    // with isolate: false — a floating rejection from another file in the same worker
    // could otherwise land in this listener, so this test runs in its own registry.
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const { service, host } = build();
      host.putFile("a.md", "one two");
      service.events.on("size-changed", () => {
        throw new Error("subscriber blew up");
      });

      service.get("a.md" as VaultPath);
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(rejections).toEqual([]);
      expect(service.get("a.md" as VaultPath).isSome()).toBe(true);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
