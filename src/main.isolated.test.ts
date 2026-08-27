import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { createFakeHost } from "@/infrastructure/host/internal/testing";

import JournalPlugin from "./main";

import type { PluginManifest } from "obsidian";

// tsconfig.app.json has no "node" types; the test process itself always has this.
declare const process: {
  on(event: "unhandledRejection", handler: (reason: unknown) => void): void;
  off(event: "unhandledRejection", handler: (reason: unknown) => void): void;
};

const MANIFEST = { id: "journal", name: "Journal", author: "test", version: "3.0.0" } as unknown as PluginManifest;

function buildPlugin(): JournalPlugin {
  return new JournalPlugin(createFakeHost().app, MANIFEST);
}

describe("JournalPlugin", () => {
  it("swallows a disposal failure on unload rather than letting it escape as an unhandled rejection", async () => {
    const plugin = buildPlugin();
    await plugin.onload();
    // A manual prototype patch, not `vi.spyOn` — vitest's own mock wrapper attaches its own
    // then/catch to any promise a mock returns (to populate `mock.results`), which marks the
    // promise as handled before production code ever gets a chance to. That makes a spied
    // `dispose()` unable to prove anything about `main.ts`'s own `.catch()`: both its presence
    // and its absence read as "no unhandled rejection" once vitest's tracking is in the chain.
    const originalDispose = Container.prototype.dispose;
    Container.prototype.dispose = () => Promise.reject(new Error("dispose boom"));
    const rejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      plugin.onunload();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejections).toEqual([]);
    } finally {
      Container.prototype.dispose = originalDispose;
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
