import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "./config";
import { InvalidShelfNameError, ShelfNameTakenError } from "./errors";
import { ShelvesLifecycleService } from "./lifecycle";

async function buildInitialized(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  const result = await settings.initialize();
  expect(result.kind).toBe("ok");
  return {
    shelves: container.resolve(ShelvesLifecycleService),
    journals: container.resolve(JournalLifecycleService),
    settings,
  };
}

describe("ShelvesLifecycleService.create", () => {
  it("adds a shelf to the collection with an empty journal list", async () => {
    const { shelves, settings } = await buildInitialized();
    const result = shelves.create("work");
    expect(result.kind).toBe("ok");
    const stored = settings.getCollection(shelvesCollection).get("work");
    expect(stored).toEqual({ name: "work", journals: [] });
  });

  it("rejects an empty name with InvalidShelfNameError", async () => {
    const { shelves } = await buildInitialized();
    const result = shelves.create("");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidShelfNameError);
  });

  it("rejects an already-used name with ShelfNameTakenError", async () => {
    const { shelves } = await buildInitialized();
    shelves.create("work");
    const result = shelves.create("work");
    expect(result.kind === "err" && result.error).toBeInstanceOf(ShelfNameTakenError);
  });
});
