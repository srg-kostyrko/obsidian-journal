import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "./config";
import { InvalidShelfNameError, ShelfNameTakenError, UnknownShelfError } from "./errors";
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

describe("ShelvesLifecycleService.rename", () => {
  it("moves the entry to the new key and clears the old", async () => {
    const { shelves, settings } = await buildInitialized();
    shelves.create("work");
    const result = shelves.rename("work", "office");
    expect(result.kind).toBe("ok");
    const col = settings.getCollection(shelvesCollection);
    expect(col.get("work")).toBeUndefined();
    expect(col.get("office")?.name).toBe("office");
  });

  it("preserves the journal list across rename", async () => {
    const { shelves, settings } = await buildInitialized();
    shelves.create("work");
    const created = settings.getCollection(shelvesCollection).get("work");
    if (created) created.journals.push("daily");
    shelves.rename("work", "office");
    expect(settings.getCollection(shelvesCollection).get("office")?.journals).toEqual(["daily"]);
  });

  it("rejects an empty new name with InvalidShelfNameError", async () => {
    const { shelves } = await buildInitialized();
    shelves.create("work");
    const result = shelves.rename("work", "");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidShelfNameError);
  });

  it("rejects renaming to the same name with InvalidShelfNameError", async () => {
    const { shelves } = await buildInitialized();
    shelves.create("work");
    const result = shelves.rename("work", "work");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidShelfNameError);
  });

  it("rejects renaming an unknown shelf with UnknownShelfError", async () => {
    const { shelves } = await buildInitialized();
    const result = shelves.rename("missing", "office");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownShelfError);
  });

  it("rejects renaming to an already-used name with ShelfNameTakenError", async () => {
    const { shelves } = await buildInitialized();
    shelves.create("work");
    shelves.create("home");
    const result = shelves.rename("work", "home");
    expect(result.kind === "err" && result.error).toBeInstanceOf(ShelfNameTakenError);
  });
});
