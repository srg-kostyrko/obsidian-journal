import { describe, expect, it } from "vitest";

import { journalConfigCollection, type JournalConfig } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { InvalidJournalNameError, JournalNameTakenError, UnknownJournalError } from "./errors";
import { JournalLifecycleService } from "./lifecycle";

async function buildInitialized(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  const result = await settings.initialize();
  expect(result.kind).toBe("ok");
  return { service: container.resolve(JournalLifecycleService), settings };
}

describe("JournalLifecycleService.create", () => {
  it("adds a fixed-write journal to the collection with defaults", async () => {
    const { service, settings } = await buildInitialized();
    const result = service.create("daily", { type: "day" });
    expect(result.kind).toBe("ok");
    const stored = settings.getCollection(journalConfigCollection).get("daily");
    expect(stored?.name).toBe("daily");
    expect(stored?.write).toEqual({ type: "day" });
  });

  it("rejects an empty name with InvalidJournalNameError", async () => {
    const { service } = await buildInitialized();
    const result = service.create("", { type: "day" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidJournalNameError);
  });

  it("rejects an already-used name with JournalNameTakenError", async () => {
    const { service } = await buildInitialized();
    service.create("daily", { type: "day" });
    const result = service.create("daily", { type: "week" });
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalNameTakenError);
  });
});

describe("JournalLifecycleService.rename", () => {
  it("moves the entry to the new key and clears the old", async () => {
    const { service, settings } = await buildInitialized();
    service.create("daily", { type: "day" });
    const result = service.rename("daily", "morning");
    expect(result.kind).toBe("ok");
    const col = settings.getCollection(journalConfigCollection);
    expect(col.get("daily")).toBeUndefined();
    expect(col.get("morning")?.name).toBe("morning");
  });

  it("rejects renaming to an empty string with InvalidJournalNameError", async () => {
    const { service } = await buildInitialized();
    service.create("a", { type: "day" });
    const result = service.rename("a", "");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidJournalNameError);
  });

  it("rejects renaming to the same name with InvalidJournalNameError", async () => {
    const { service } = await buildInitialized();
    service.create("a", { type: "day" });
    const result = service.rename("a", "a");
    expect(result.kind === "err" && result.error).toBeInstanceOf(InvalidJournalNameError);
  });

  it("rejects renaming an unknown journal with UnknownJournalError", async () => {
    const { service } = await buildInitialized();
    const result = service.rename("missing", "x");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownJournalError);
  });

  it("rejects renaming to an already-used name with JournalNameTakenError", async () => {
    const { service } = await buildInitialized();
    service.create("a", { type: "day" });
    service.create("b", { type: "week" });
    const result = service.rename("a", "b");
    expect(result.kind === "err" && result.error).toBeInstanceOf(JournalNameTakenError);
  });

  it("preserves every non-name field across rename", async () => {
    const { service, settings } = await buildInitialized();
    service.create("a", { type: "day" });
    const col = settings.getCollection(journalConfigCollection);
    const original = col.get("a") as JournalConfig;
    original.dateFormat = "YYYY/MM/DD";
    original.numbering.enabled = true;
    const r = service.rename("a", "b");
    expect(r.kind).toBe("ok");
    const renamed = col.get("b") as JournalConfig;
    expect(renamed.dateFormat).toBe("YYYY/MM/DD");
    expect(renamed.numbering.enabled).toBe(true);
    expect(renamed.name).toBe("b");
  });
});

describe("JournalLifecycleService.delete", () => {
  it("removes the entry from the collection", async () => {
    const { service, settings } = await buildInitialized();
    service.create("daily", { type: "day" });
    const result = service.delete("daily");
    expect(result.kind).toBe("ok");
    expect(settings.getCollection(journalConfigCollection).get("daily")).toBeUndefined();
  });

  it("rejects deleting an unknown journal with UnknownJournalError", async () => {
    const { service } = await buildInitialized();
    const result = service.delete("missing");
    expect(result.kind === "err" && result.error).toBeInstanceOf(UnknownJournalError);
  });
});
