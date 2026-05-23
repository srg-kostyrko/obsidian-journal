import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals";
import { UnknownJournalError } from "@/journals/errors";
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
    const created = settings.getCollection(shelvesCollection).get("work")!;
    created.journals.push("daily");
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

describe("ShelvesLifecycleService.delete", () => {
  it("removes the shelf, leaving its journals unassigned", async () => {
    const { shelves, settings } = await buildInitialized();
    shelves.create("work");
    const col = settings.getCollection(shelvesCollection);
    col.get("work")!.journals.push("daily");
    const result = shelves.delete("work");
    expect(result.kind).toBe("ok");
    expect(col.get("work")).toBeUndefined();
  });

  it("moves member journals to the destination shelf", async () => {
    const { shelves, settings } = await buildInitialized();
    shelves.create("work");
    shelves.create("home");
    const col = settings.getCollection(shelvesCollection);
    col.get("work")!.journals.push("daily");
    const result = shelves.delete("work", "home");
    expect(result.kind).toBe("ok");
    expect(col.get("home")?.journals).toEqual(["daily"]);
  });

  it("rejects deleting an unknown shelf with UnknownShelfError", async () => {
    const { shelves } = await buildInitialized();
    const result = shelves.delete("missing");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownShelfError);
  });

  it("rejects an unknown destination shelf with UnknownShelfError", async () => {
    const { shelves } = await buildInitialized();
    shelves.create("work");
    const result = shelves.delete("work", "missing");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownShelfError);
  });
});

describe("ShelvesLifecycleService.assign", () => {
  it("places a journal on a shelf", async () => {
    const { shelves, journals, settings } = await buildInitialized();
    journals.create("daily", { type: "day" });
    shelves.create("work");
    const result = shelves.assign("daily", "work");
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(shelvesCollection).get("work")?.journals).toEqual(["daily"]);
  });

  it("moves a journal off its previous shelf onto the new one", async () => {
    const { shelves, journals, settings } = await buildInitialized();
    journals.create("daily", { type: "day" });
    shelves.create("work");
    shelves.create("home");
    shelves.assign("daily", "work");
    shelves.assign("daily", "home");
    const col = settings.getCollection(shelvesCollection);
    expect(col.get("work")?.journals).toEqual([]);
    expect(col.get("home")?.journals).toEqual(["daily"]);
  });

  it("removes a journal from all shelves when the shelf name is empty", async () => {
    const { shelves, journals, settings } = await buildInitialized();
    journals.create("daily", { type: "day" });
    shelves.create("work");
    shelves.assign("daily", "work");
    const result = shelves.assign("daily", "");
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(shelvesCollection).get("work")?.journals).toEqual([]);
  });

  it("rejects an unknown journal with UnknownJournalError", async () => {
    const { shelves } = await buildInitialized();
    shelves.create("work");
    const result = shelves.assign("missing", "work");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownJournalError);
  });

  it("rejects an unknown shelf with UnknownShelfError", async () => {
    const { shelves, journals } = await buildInitialized();
    journals.create("daily", { type: "day" });
    const result = shelves.assign("daily", "missing");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownShelfError);
  });
});

describe("ShelvesLifecycleService events", () => {
  it("emits shelfRenamed when a shelf is renamed", async () => {
    const { shelves } = await buildInitialized({ version: 3, shelves: { work: { name: "work", journals: [] } } });
    const events: { oldName: string; newName: string }[] = [];
    shelves.events.on("shelfRenamed", (payload) => events.push(payload));
    shelves.rename("work", "office");
    expect(events).toEqual([{ oldName: "work", newName: "office" }]);
  });

  it("emits shelfDeleted when a shelf is deleted", async () => {
    const { shelves } = await buildInitialized({ version: 3, shelves: { work: { name: "work", journals: [] } } });
    const events: { shelfName: string }[] = [];
    shelves.events.on("shelfDeleted", (payload) => events.push(payload));
    shelves.delete("work");
    expect(events).toEqual([{ shelfName: "work" }]);
  });
});

describe("ShelvesLifecycleService reconciliation", () => {
  it("replaces a renamed journal's name in every shelf", async () => {
    const { shelves, journals, settings } = await buildInitialized();
    journals.create("daily", { type: "day" });
    shelves.create("work");
    shelves.assign("daily", "work");
    journals.rename("daily", "morning");
    expect(settings.getCollection(shelvesCollection).get("work")?.journals).toEqual(["morning"]);
  });

  it("removes a deleted journal from every shelf", async () => {
    const { shelves, journals, settings } = await buildInitialized();
    journals.create("daily", { type: "day" });
    shelves.create("work");
    shelves.assign("daily", "work");
    journals.delete("daily");
    expect(settings.getCollection(shelvesCollection).get("work")?.journals).toEqual([]);
  });
});
