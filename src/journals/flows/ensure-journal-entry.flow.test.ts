import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import { anchor, withoutEras } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { NoteDeleteError, NotesService, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../module";
import { JournalDateFormatError } from "../notes/errors";
import { TemplateContentService } from "../notes/template-content";
import { fixedJournal } from "../testing";

import { EnsureJournalEntryFlow } from "./ensure-journal-entry.flow";

describe("EnsureJournalEntryFlow", () => {
  describe("creating a note", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("creates the note without opening it", async () => {
      const result = await harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
      });

      expect(result.isOk() && result.value).toEqual({ path: "2026-05-19.md", created: true });
      expect(harness.host.files.has("2026-05-19.md")).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen("2026-05-19.md" as VaultPath)).toBe(false);
    });

    it("reports created false for a note that already exists", async () => {
      harness.host.putFile("2026-05-19.md", "existing");

      const result = await harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
      });

      expect(result.isOk() && result.value.created).toBe(false);
    });
  });

  describe("the creation prompt", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) } },
      });
    });

    it("honors the journal's creation prompt by default", async () => {
      const pending = harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
      });
      await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));

      harness.modals.lastOpen<unknown, boolean>().submit(true);
      const settled = await pending;
      expect(settled.isOk()).toBe(true);
    });

    it("skips the creation prompt when asked to", async () => {
      const result = await harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
        skipConfirmation: true,
      });

      expect(harness.modals.opens).toHaveLength(0);
      expect(result.isOk() && result.value.created).toBe(true);
    });
  });
});

describe("EnsureJournalEntryFlow — an unrenderable date format in the template body", () => {
  it("a template body with an unrenderable {{date:...}} fails creation with a notice", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
    });
    harness.host.putFile("Templates/daily.md", "# {{date:YYYYy}}");

    const result = await withoutEras(() =>
      harness.resolve(Flows).invoke(EnsureJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") }),
    );

    assert(result.isErr() && result.error instanceof JournalDateFormatError, "expected JournalDateFormatError");
    expect(result.error.pattern).toBe("YYYYy");
    expect(harness.notices.messages).toEqual([
      m.journal_date_format_unrenderable_notice({ journalName: "daily", format: "YYYYy", reason: result.error.reason }),
    ]);
    expect(harness.host.files.has("2026-05-19.md")).toBe(false);
  });

  it("keeps a note that was written to while its body rendered", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
    });
    harness.host.putFile("Templates/daily.md", "# {{date:YYYYy}}");
    const content = harness.resolve(TemplateContentService);
    const renderFor = content.renderFor.bind(content);
    const notes = harness.resolve(NotesService);
    vi.spyOn(content, "renderFor").mockImplementation((...parameters: Parameters<typeof renderFor>) =>
      notes
        .write("2026-05-19.md" as VaultPath, "typed while Templater waited")
        .mapErr((): never => {
          throw new Error("staging write failed");
        })
        .flatMap(() => renderFor(...parameters)),
    );

    const result = await withoutEras(() =>
      harness.resolve(Flows).invoke(EnsureJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") }),
    );

    expect(result.isErr() && result.error instanceof JournalDateFormatError).toBe(true);
    expect(harness.host.files.get("2026-05-19.md")?.content).toBe("typed while Templater waited");
  });

  it("logs a take-back that fails and still reports the render error", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { templates: ["Templates/daily.md"] }) } },
    });
    harness.host.putFile("Templates/daily.md", "# {{date:YYYYy}}");
    vi.spyOn(harness.resolve(NotesService), "delete").mockReturnValue(
      AsyncResult.err(new NoteDeleteError("2026-05-19.md" as VaultPath, new Error("locked"))),
    );

    const result = await withoutEras(() =>
      harness.resolve(Flows).invoke(EnsureJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") }),
    );

    expect(result.isErr() && result.error instanceof JournalDateFormatError).toBe(true);
    const logged = harness.logs.records.find((record) => record.message.startsWith("could not take back"));
    expect(logged?.level).toBe("error");
    expect(logged?.fields?.path).toBe("2026-05-19.md");
    expect(logged?.fields?.renderError).toBeInstanceOf(JournalDateFormatError);
  });
});
