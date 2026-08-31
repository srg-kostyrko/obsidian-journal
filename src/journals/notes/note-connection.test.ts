import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { NoteDeleteError, NoteNotFoundError, NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { buildNoteletType, customJournal, fixedJournal } from "../testing";

import { AnchorOccupiedError, EmptyNoteNameError } from "./errors";
import { NoteConnectionService } from "./note-connection";

import type { TypeId } from "../notelets/config";
import type { Prompt } from "../prompts/config";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

function dailyWithFrontmatter(patch: { addStartDate?: boolean; addEndDate?: boolean }) {
  const daily = fixedJournal("daily", { type: "day" });
  return { daily: { ...daily, frontmatter: { ...daily.frontmatter, ...patch } } };
}

function weeklyWith(patch: { addStartDate?: boolean; addEndDate?: boolean } = {}) {
  const weekly = fixedJournal("weekly", { type: "week" });
  return { weekly: { ...weekly, frontmatter: { ...weekly.frontmatter, ...patch } } };
}

describe("NoteConnectionService", () => {
  describe("disconnect", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("strips journal-owned frontmatter keys from a connected note", async () => {
      const path = "2026-06-01.md" as VaultPath;
      harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });

      const result = await harness.resolve(NoteConnectionService).disconnect(path);

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.get(path)?.frontmatter).toEqual({ title: "keep" });
    });

    it("falls back to default-key stripping for an orphaned note with a stale journal key", async () => {
      const path = "2026-06-01.md" as VaultPath;
      harness.host.putFile(path, "content", {
        journal: "deleted",
        "journal-date": "2026-06-01",
        "journal-index": 3,
        body: "keep",
      });
      // NOT registering in index — simulating an orphaned note

      const result = await harness.resolve(NoteConnectionService).disconnect(path);

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.get(path)?.frontmatter).toEqual({ body: "keep" });
    });
  });

  describe("disconnectAll", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("strips the journal's frontmatter keys from every connected note", async () => {
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      harness.host.putFile(first, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      harness.host.putFile(second, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await harness.resolve(NoteConnectionService).disconnectAll("daily");

      expect(harness.host.files.get(first)?.frontmatter).toEqual({ title: "keep" });
      expect(harness.host.files.get(second)?.frontmatter).toEqual({ title: "keep" });
    });

    it("clears the remaining notes when one note's update fails", async () => {
      const failing = "a.md" as VaultPath;
      const surviving = "b.md" as VaultPath;
      harness.host.putFile(failing, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      harness.host.putFile(surviving, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
      const notes = harness.resolve(NotesService);
      const original = notes.updateFrontmatter.bind(notes);
      vi.spyOn(notes, "updateFrontmatter").mockImplementation((path, mutate) =>
        path === failing ? AsyncResult.err(new NoteNotFoundError(failing)) : original(path, mutate),
      );

      await harness.resolve(NoteConnectionService).disconnectAll("daily");

      expect(harness.host.files.get(surviving)?.frontmatter).toEqual({ title: "keep" });
      expect(harness.host.files.get(failing)?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-06-01",
        title: "keep",
      });
    });
  });

  describe("deleteAll", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("trashes every connected note", async () => {
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      harness.host.putFile(first, "content", { journal: "daily", "journal-date": "2026-06-01" });
      harness.host.putFile(second, "content", { journal: "daily", "journal-date": "2026-06-02" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await harness.resolve(NoteConnectionService).deleteAll("daily");

      expect(harness.host.files.has(first)).toBe(false);
      expect(harness.host.files.has(second)).toBe(false);
    });

    it("trashes the remaining notes when one note's deletion fails", async () => {
      const failing = "a.md" as VaultPath;
      const surviving = "b.md" as VaultPath;
      harness.host.putFile(failing, "content", { journal: "daily", "journal-date": "2026-06-01" });
      harness.host.putFile(surviving, "content", { journal: "daily", "journal-date": "2026-06-02" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
      const notes = harness.resolve(NotesService);
      const original = notes.delete.bind(notes);
      vi.spyOn(notes, "delete").mockImplementation((path) =>
        path === failing ? AsyncResult.err(new NoteDeleteError(failing, new Error("boom"))) : original(path),
      );

      await harness.resolve(NoteConnectionService).deleteAll("daily");

      expect(harness.host.files.has(surviving)).toBe(false);
      expect(harness.host.files.has(failing)).toBe(true);
    });
  });

  describe("reconnectAll", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("rewrites the journal name in every connected note to the new name", async () => {
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      harness.host.putFile(first, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      harness.host.putFile(second, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await harness.resolve(NoteConnectionService).reconnectAll("daily", "morning");

      expect(harness.host.files.get(first)?.frontmatter).toEqual({
        journal: "morning",
        "journal-date": "2026-06-01",
        title: "keep",
      });
      expect(harness.host.files.get(second)?.frontmatter).toEqual({
        journal: "morning",
        "journal-date": "2026-06-02",
        title: "keep",
      });
    });

    it("rewrites the remaining notes when one note's update fails", async () => {
      const failing = "a.md" as VaultPath;
      const surviving = "b.md" as VaultPath;
      harness.host.putFile(failing, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      harness.host.putFile(surviving, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: failing });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: surviving });
      const notes = harness.resolve(NotesService);
      const original = notes.updateFrontmatter.bind(notes);
      vi.spyOn(notes, "updateFrontmatter").mockImplementation((path, mutate) =>
        path === failing ? AsyncResult.err(new NoteNotFoundError(failing)) : original(path, mutate),
      );

      await harness.resolve(NoteConnectionService).reconnectAll("daily", "morning");

      expect(harness.host.files.get(surviving)?.frontmatter).toEqual({
        journal: "morning",
        "journal-date": "2026-06-02",
        title: "keep",
      });
      expect(harness.host.files.get(failing)?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-06-01",
        title: "keep",
      });
    });
  });

  describe("renameFieldAll", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("moves the value from the old key to the new key in every connected note", async () => {
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      harness.host.putFile(first, "content", { journal: "daily", "journal-date": "2026-06-01", title: "keep" });
      harness.host.putFile(second, "content", { journal: "daily", "journal-date": "2026-06-02", title: "keep" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await harness.resolve(NoteConnectionService).renameFieldAll("daily", "journal-date", "date");

      expect(harness.host.files.get(first)?.frontmatter).toEqual({
        journal: "daily",
        date: "2026-06-01",
        title: "keep",
      });
      expect(harness.host.files.get(second)?.frontmatter).toEqual({
        journal: "daily",
        date: "2026-06-02",
        title: "keep",
      });
    });

    it("leaves a note that lacks the old key untouched", async () => {
      const path = "a.md" as VaultPath;
      harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01" });
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });

      await harness.resolve(NoteConnectionService).renameFieldAll("daily", "absent-key", "date");

      expect(harness.host.files.get(path)?.frontmatter).toEqual({ journal: "daily", "journal-date": "2026-06-01" });
    });
  });

  describe("reapplyAll", () => {
    it("writes the start date property to every connected note when addStartDate is on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: dailyWithFrontmatter({ addStartDate: true }) },
      });
      const first = "a.md" as VaultPath;
      const second = "b.md" as VaultPath;
      harness.host.putFile(first, "content", { journal: "daily", "journal-date": "2026-06-01" });
      harness.host.putFile(second, "content", { journal: "daily", "journal-date": "2026-06-02" });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: first });
      index.register({ journalName: "daily", anchor: anchor("2026-06-02"), path: second });

      await harness.resolve(NoteConnectionService).reapplyAll("daily");

      expect(harness.host.files.get(first)?.frontmatter["journal-start-date"]).toBe("2026-06-01");
      expect(harness.host.files.get(second)?.frontmatter["journal-start-date"]).toBe("2026-06-02");
    });

    it("removes the start date property from connected notes when addStartDate is off", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: dailyWithFrontmatter({ addStartDate: false }) },
      });
      const path = "a.md" as VaultPath;
      harness.host.putFile(path, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-start-date": "2026-06-01",
      });
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });

      await harness.resolve(NoteConnectionService).reapplyAll("daily");

      expect("journal-start-date" in (harness.host.files.get(path)?.frontmatter ?? {})).toBe(false);
    });

    it("writes the period end property to connected notes when addEndDate is on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: dailyWithFrontmatter({ addEndDate: true }) },
      });
      const path = "a.md" as VaultPath;
      harness.host.putFile(path, "content", { journal: "daily", "journal-date": "2026-06-01" });
      harness.resolve(JournalsIndex).register({ journalName: "daily", anchor: anchor("2026-06-01"), path });

      await harness.resolve(NoteConnectionService).reapplyAll("daily");

      expect(harness.host.files.get(path)?.frontmatter["journal-end-date"]).toBe("2026-06-01");
    });

    describe("a daily journal that no longer adds an end date", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: dailyWithFrontmatter({ addEndDate: false }) },
        });
      });

      it("removes a period-default end property from connected notes when addEndDate is off", async () => {
        const path = "a.md" as VaultPath;
        harness.host.putFile(path, "content", {
          journal: "daily",
          "journal-date": "2026-06-01",
          "journal-end-date": "2026-06-01",
        });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "daily", anchor: anchor("2026-06-01"), path, endDate: anchor("2026-06-01") });

        await harness.resolve(NoteConnectionService).reapplyAll("daily");

        expect("journal-end-date" in (harness.host.files.get(path)?.frontmatter ?? {})).toBe(false);
      });

      it("keeps an extended end date when addEndDate is off", async () => {
        const path = "a.md" as VaultPath;
        harness.host.putFile(path, "content", {
          journal: "daily",
          "journal-date": "2026-06-01",
          "journal-end-date": "2026-06-05",
        });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "daily", anchor: anchor("2026-06-01"), path, endDate: anchor("2026-06-05") });

        await harness.resolve(NoteConnectionService).reapplyAll("daily");

        expect(harness.host.files.get(path)?.frontmatter["journal-end-date"]).toBe("2026-06-05");
      });
    });

    describe("a custom interval journal", () => {
      let harness: TestHarness;

      // 10-day intervals from 2026-06-01: the first interval's default end is 2026-06-10.
      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { sprint: customJournal("sprint", "day", 10, "2026-06-01") } },
        });
      });

      it("removes a custom interval's duration-default end when addEndDate is off", async () => {
        const path = "a.md" as VaultPath;
        harness.host.putFile(path, "content", {
          journal: "sprint",
          "journal-date": "2026-06-01",
          "journal-end-date": "2026-06-10",
        });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "sprint", anchor: anchor("2026-06-01"), path, endDate: anchor("2026-06-10") });

        await harness.resolve(NoteConnectionService).reapplyAll("sprint");

        expect("journal-end-date" in (harness.host.files.get(path)?.frontmatter ?? {})).toBe(false);
      });

      it("keeps a custom interval's extended end when addEndDate is off", async () => {
        const path = "a.md" as VaultPath;
        harness.host.putFile(path, "content", {
          journal: "sprint",
          "journal-date": "2026-06-01",
          "journal-end-date": "2026-06-20",
        });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "sprint", anchor: anchor("2026-06-01"), path, endDate: anchor("2026-06-20") });

        await harness.resolve(NoteConnectionService).reapplyAll("sprint");

        expect(harness.host.files.get(path)?.frontmatter["journal-end-date"]).toBe("2026-06-20");
      });
    });
  });

  describe("connect", () => {
    describe("a plain daily journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
        });
      });

      it("attaches the note at the resolved anchor when the slot is free", async () => {
        const path = "inbox/note.md" as VaultPath;
        harness.host.putFile(path, "");

        const result = await harness.resolve(NoteConnectionService).connect("daily", path, anchor("2026-06-01"));

        expect(result.isOk()).toBe(true);
        const fm = harness.host.files.get(path)?.frontmatter;
        expect(fm?.journal).toBe("daily");
        expect(typeof fm?.["journal-date"]).toBe("string");
      });

      it("errors with AnchorOccupiedError when another note holds the anchor and override is not set", async () => {
        const occupantPath = "2026-06-01.md" as VaultPath;
        const incomingPath = "inbox/note.md" as VaultPath;
        harness.host.putFile(occupantPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
        harness.host.putFile(incomingPath, "");
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "daily", anchor: anchor("2026-06-01"), path: occupantPath });

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", incomingPath, anchor("2026-06-01"));

        expect(result.isErr()).toBe(true);
        expect(result.isErr() && result.error instanceof AnchorOccupiedError).toBe(true);
      });

      it("disconnects the occupant first when override is true", async () => {
        const occupantPath = "2026-06-01.md" as VaultPath;
        const incomingPath = "inbox/note.md" as VaultPath;
        harness.host.putFile(occupantPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
        harness.host.putFile(incomingPath, "");
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "daily", anchor: anchor("2026-06-01"), path: occupantPath });

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", incomingPath, anchor("2026-06-01"), { override: true });

        expect(result.isOk()).toBe(true);
        expect(harness.host.files.get(occupantPath)?.frontmatter.journal).toBeUndefined();
        expect(harness.host.files.get(incomingPath)?.frontmatter.journal).toBe("daily");
      });

      it("transfers the anchor's stored endDate to the new note when overriding", async () => {
        const occupantPath = "2026-06-01.md" as VaultPath;
        const incomingPath = "inbox/note.md" as VaultPath;
        harness.host.putFile(occupantPath, "content", {
          journal: "daily",
          "journal-date": "2026-06-01",
          "journal-end-date": "2026-06-05",
        });
        harness.host.putFile(incomingPath, "");
        harness.resolve(JournalsIndex).register({
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path: occupantPath,
          endDate: anchor("2026-06-05"),
        });

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", incomingPath, anchor("2026-06-01"), { override: true });

        expect(result.isOk()).toBe(true);
        expect(harness.host.files.get(incomingPath)?.frontmatter["journal-end-date"]).toBe("2026-06-05");
      });
    });

    describe("a daily journal writing into a folder", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }) } },
        });
      });

      it("renames and moves the note to the configured path when rename and move are true", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        const configuredPath = "Journal/2026-06-01.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expect(result.isOk()).toBe(true);
        expect(harness.host.files.has(sourcePath)).toBe(false);
        expect(harness.host.files.has(configuredPath)).toBe(true);
        expect(harness.host.files.get(configuredPath)?.frontmatter.journal).toBe("daily");
      });

      it("trashes the occupant when overriding and relocating onto its path", async () => {
        const occupantPath = "Journal/2026-06-01.md" as VaultPath;
        const incomingPath = "inbox/note.md" as VaultPath;
        harness.host.putFile(occupantPath, "OCCUPANT", { journal: "daily", "journal-date": "2026-06-01" });
        harness.host.putFile(incomingPath, "INCOMING");
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "daily", anchor: anchor("2026-06-01"), path: occupantPath });

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", incomingPath, anchor("2026-06-01"), { override: true, rename: true, move: true });

        expectOk(result);
        expect(harness.host.files.has(incomingPath)).toBe(false);
        expect(harness.host.files.get(occupantPath)?.content).toBe("INCOMING");
        expect(harness.host.files.get(occupantPath)?.frontmatter.journal).toBe("daily");
      });
    });

    describe("a folder journal whose name template resolves to an empty name", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal", nameTemplate: "" }) },
          },
        });
      });

      it("refuses to rename the note when the name template resolves to an empty name", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
      });

      it("leaves the note in place when it refuses to rename it", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expect(harness.host.files.has(sourcePath)).toBe(true);
      });
    });

    describe("a journal with a prompt in its name template", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                { folder: "Journal", nameTemplate: "{{date}} {{mood}}", prompts: [mood] },
              ),
            },
          },
        });
      });

      it("keeps the note's own name when the target journal has a prompt in its name template", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expectOk(result);
        expect(harness.host.files.has("Journal/note.md")).toBe(true);
        expect(harness.host.files.has("Journal/2026-06-01 (unanswered).md")).toBe(false);
      });

      it("still moves the note into the journal's configured folder", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expect(harness.host.files.has("inbox/note.md")).toBe(false);
        expect(harness.host.files.has("Journal/note.md")).toBe(true);
      });

      it("still connects the note despite refusing the rename", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expect(harness.host.files.get("Journal/note.md")?.frontmatter.journal).toBe("daily");
      });
    });

    describe("a journal with a prompt in its folder template", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                { folder: "Journal/{{mood}}", nameTemplate: "{{date}}", prompts: [mood] },
              ),
            },
          },
        });
      });

      it("keeps the note's own folder when the target journal has a prompt in its folder template", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        const result = await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expectOk(result);
        expect(harness.host.files.has("inbox/2026-06-01.md")).toBe(true);
      });

      it("still renames the note to the journal's configured name", async () => {
        const sourcePath = "inbox/note.md" as VaultPath;
        harness.host.putFile(sourcePath, "");

        await harness
          .resolve(NoteConnectionService)
          .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

        expect(harness.host.files.has("inbox/note.md")).toBe(false);
        expect(harness.host.files.has("inbox/2026-06-01.md")).toBe(true);
      });
    });

    it("renames normally when no prompt reaches the path", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }) } },
      });
      const sourcePath = "inbox/note.md" as VaultPath;
      harness.host.putFile(sourcePath, "");

      const result = await harness
        .resolve(NoteConnectionService)
        .connect("daily", sourcePath, anchor("2026-06-01"), { rename: true, move: true });

      expectOk(result);
      expect(harness.host.files.has("Journal/2026-06-01.md")).toBe(true);
    });

    it("does not derive a path when neither rename nor move is requested", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) } },
      });
      const sourcePath = "inbox/note.md" as VaultPath;
      harness.host.putFile(sourcePath, "");

      const result = await harness.resolve(NoteConnectionService).connect("daily", sourcePath, anchor("2026-06-01"));

      expect(result.isOk()).toBe(true);
      expect(harness.host.files.has(sourcePath)).toBe(true);
    });
  });

  describe("reanchorAll", () => {
    describe("a weekly journal writing neither start nor end date", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: weeklyWith() },
        });
      });

      it("writes the target anchor into the date field", async () => {
        harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness.resolve(JournalsIndex).register({
          journalName: "weekly",
          anchor: anchor("2026-06-01"),
          path: "week/2026-W23.md" as VaultPath,
        });

        await harness
          .resolve(NoteConnectionService)
          .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-31") }]]));

        expect(harness.host.files.get("week/2026-W23.md")?.frontmatter["journal-date"]).toBe("2026-05-31");
      });

      it("leaves a note whose target equals its current anchor untouched", async () => {
        harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness.resolve(JournalsIndex).register({
          journalName: "weekly",
          anchor: anchor("2026-06-01"),
          path: "week/2026-W23.md" as VaultPath,
        });
        const result = await harness
          .resolve(NoteConnectionService)
          .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-06-01") }]]));

        expectOk(result);
        expect(result.value.rewritten).toBe(0);
      });

      it("reports how many notes it rewrote", async () => {
        harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness.host.putFile("week/2026-W24.md", "", { journal: "weekly", "journal-date": "2026-06-08" });
        const index = harness.resolve(JournalsIndex);
        index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
        index.register({ journalName: "weekly", anchor: anchor("2026-06-08"), path: "week/2026-W24.md" as VaultPath });

        const result = await harness.resolve(NoteConnectionService).reanchorAll(
          "weekly",
          new Map([
            ["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-31") }],
            ["week/2026-W24.md" as VaultPath, { anchor: anchor("2026-06-07") }],
          ]),
        );

        expectOk(result);
        expect(result.value.rewritten).toBe(2);
      });

      it("keeps rewriting the remaining notes after one note fails", async () => {
        harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness.host.putFile("week/2026-W24.md", "", { journal: "weekly", "journal-date": "2026-06-08" });
        const index = harness.resolve(JournalsIndex);
        index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
        index.register({ journalName: "weekly", anchor: anchor("2026-06-08"), path: "week/2026-W24.md" as VaultPath });
        vi.spyOn(harness.resolve(NotesService), "updateFrontmatter").mockImplementationOnce(() =>
          AsyncResult.err(new NoteNotFoundError("week/2026-W23.md" as VaultPath)),
        );

        await harness.resolve(NoteConnectionService).reanchorAll(
          "weekly",
          new Map([
            ["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-31") }],
            ["week/2026-W24.md" as VaultPath, { anchor: anchor("2026-06-07") }],
          ]),
        );

        expect(harness.host.files.get("week/2026-W24.md")?.frontmatter["journal-date"]).toBe("2026-06-07");
      });

      it("counts a note whose write failed as failed", async () => {
        harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
        vi.spyOn(harness.resolve(NotesService), "updateFrontmatter").mockImplementation(() =>
          AsyncResult.err(new NoteNotFoundError("week/2026-W23.md" as VaultPath)),
        );

        const result = await harness
          .resolve(NoteConnectionService)
          .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-31") }]]));

        expectOk(result);
        expect(result.value.failed).toBe(1);
      });

      it("refuses a target already held by a note that is staying put", async () => {
        harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness.host.putFile("week/2026-W24.md", "", { journal: "weekly", "journal-date": "2026-06-08" });
        const index = harness.resolve(JournalsIndex);
        index.register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });
        index.register({ journalName: "weekly", anchor: anchor("2026-06-08"), path: "week/2026-W24.md" as VaultPath });

        // W23 is told to move onto W24's anchor, which W24 keeps (no target of its own).
        await harness
          .resolve(NoteConnectionService)
          .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-06-08") }]]));

        expect(harness.host.files.get("week/2026-W23.md")?.frontmatter["journal-date"]).toBe("2026-06-01");
      });
    });

    it("recomputes the start date field from the new anchor", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: weeklyWith({ addStartDate: true }) },
      });
      harness.host.putFile("week/2026-W23.md", "", {
        journal: "weekly",
        "journal-date": "2026-06-01",
        "journal-start-date": "2026-06-01",
      });
      harness.resolve(JournalsIndex).register({
        journalName: "weekly",
        anchor: anchor("2026-06-01"),
        path: "week/2026-W23.md" as VaultPath,
      });

      await harness
        .resolve(NoteConnectionService)
        .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-25") }]]));

      expect(harness.host.files.get("week/2026-W23.md")?.frontmatter["journal-start-date"]).toBe("2026-05-25");
    });

    it("writes the target's end date into the frontmatter when the target supplies one", async () => {
      // Whether a stored end is stale period metadata or a genuine manual extension can only be
      // judged against the grid it was written under — by the time a reanchor runs, the caller
      // has already moved the live grid to the new one (see ReanchorTarget). This service just
      // applies whatever endDate the caller decided on; it doesn't re-derive that decision.
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: weeklyWith({ addEndDate: false }) },
      });
      harness.host.putFile("week/2026-W23.md", "", { journal: "weekly", "journal-date": "2026-06-01" });
      harness
        .resolve(JournalsIndex)
        .register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: "week/2026-W23.md" as VaultPath });

      await harness
        .resolve(NoteConnectionService)
        .reanchorAll(
          "weekly",
          new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-25"), endDate: anchor("2026-06-21") }]]),
        );

      expect(harness.host.files.get("week/2026-W23.md")?.frontmatter["journal-end-date"]).toBe("2026-06-21");
    });

    it("recomputes the end date from the new anchor when the target omits one", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: weeklyWith({ addEndDate: true }) },
      });
      harness.host.putFile("week/2026-W23.md", "", {
        journal: "weekly",
        "journal-date": "2026-06-01",
        "journal-end-date": "2026-06-07",
      });
      harness.resolve(JournalsIndex).register({
        journalName: "weekly",
        anchor: anchor("2026-06-01"),
        path: "week/2026-W23.md" as VaultPath,
        endDate: anchor("2026-06-07"),
      });

      await harness
        .resolve(NoteConnectionService)
        .reanchorAll("weekly", new Map([["week/2026-W23.md" as VaultPath, { anchor: anchor("2026-05-25") }]]));

      expect(harness.host.files.get("week/2026-W23.md")?.frontmatter["journal-end-date"]).toBe("2026-05-31");
    });

    describe("notelets", () => {
      let harness: TestHarness;
      const noteletPath = "notelet.md" as VaultPath;

      beforeEach(async () => {
        const weekly = fixedJournal("weekly", { type: "week" });
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              weekly: {
                ...weekly,
                // addEndDate on: with it off, the period mutator also clears journal-end-date,
                // so "writes no end date" would pass whether or not a notelet actually used the
                // notelet mutator — this is what makes the assertion mean something.
                frontmatter: { ...weekly.frontmatter, addEndDate: true },
                notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) },
              },
            },
          },
        });
      });

      it("moves a notelet with the notelet mutator and writes no end date", async () => {
        harness.host.putFile(noteletPath, "content", {
          journal: "weekly",
          "journal-date": "2026-05-31",
          "journal-notelet": "Standup",
        });
        harness.resolve(JournalsIndex).register({
          kind: "notelet",
          journalName: "weekly",
          anchor: anchor("2026-05-31"),
          path: noteletPath,
          typeName: "Standup",
          typeId: "nt_1" as TypeId,
        });

        await harness
          .resolve(NoteConnectionService)
          .reanchorAll(
            "weekly",
            new Map([[noteletPath, { anchor: anchor("2026-06-01"), noteletTypeName: "Standup" }]]),
          );

        const frontmatter = harness.host.files.get(noteletPath)?.frontmatter ?? {};
        expect(frontmatter).toMatchObject({ "journal-date": "2026-06-01", "journal-notelet": "Standup" });
        expect(frontmatter).not.toHaveProperty("journal-end-date");
      });

      it("never blocks a notelet on an anchor a period note holds", async () => {
        const periodPath = "week/2026-W23.md" as VaultPath;
        harness.host.putFile(periodPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: periodPath });

        harness.host.putFile(noteletPath, "content", {
          journal: "weekly",
          "journal-date": "2026-05-31",
          "journal-notelet": "Standup",
        });
        harness.resolve(JournalsIndex).register({
          kind: "notelet",
          journalName: "weekly",
          anchor: anchor("2026-05-31"),
          path: noteletPath,
          typeName: "Standup",
          typeId: "nt_1" as TypeId,
        });

        // The period note above stays put (no target of its own), which claims 2026-06-01 in the
        // period loop's slot bookkeeping. The notelet loop must never consult that bookkeeping.
        const result = await harness
          .resolve(NoteConnectionService)
          .reanchorAll(
            "weekly",
            new Map([[noteletPath, { anchor: anchor("2026-06-01"), noteletTypeName: "Standup" }]]),
          );

        expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ "journal-date": "2026-06-01" });
        expectOk(result);
        expect(result.value.failed).toBe(0);
      });

      it("never blocks two notelets landing on one anchor", async () => {
        const firstPath = "notelet-1.md" as VaultPath;
        const secondPath = "notelet-2.md" as VaultPath;
        harness.host.putFile(firstPath, "content", {
          journal: "weekly",
          "journal-date": "2026-05-31",
          "journal-notelet": "Standup",
        });
        harness.host.putFile(secondPath, "content", {
          journal: "weekly",
          "journal-date": "2026-05-31",
          "journal-notelet": "Standup",
        });
        const index = harness.resolve(JournalsIndex);
        index.register({
          kind: "notelet",
          journalName: "weekly",
          anchor: anchor("2026-05-31"),
          path: firstPath,
          typeName: "Standup",
          typeId: "nt_1" as TypeId,
        });
        index.register({
          kind: "notelet",
          journalName: "weekly",
          anchor: anchor("2026-05-31"),
          path: secondPath,
          typeName: "Standup",
          typeId: "nt_1" as TypeId,
        });

        const result = await harness.resolve(NoteConnectionService).reanchorAll(
          "weekly",
          new Map([
            [firstPath, { anchor: anchor("2026-06-01"), noteletTypeName: "Standup" }],
            [secondPath, { anchor: anchor("2026-06-01"), noteletTypeName: "Standup" }],
          ]),
        );

        expectOk(result);
        expect(result.value.failed).toBe(0);
        expect(harness.host.files.get(firstPath)?.frontmatter).toMatchObject({ "journal-date": "2026-06-01" });
        expect(harness.host.files.get(secondPath)?.frontmatter).toMatchObject({ "journal-date": "2026-06-01" });
      });

      it("keeps a notelet write failure out of both failed and rewritten", async () => {
        const periodPath = "week/2026-W23.md" as VaultPath;
        const movingNoteletPath = "notelet-moving.md" as VaultPath;
        harness.host.putFile(periodPath, "", { journal: "weekly", "journal-date": "2026-06-01" });
        harness
          .resolve(JournalsIndex)
          .register({ journalName: "weekly", anchor: anchor("2026-06-01"), path: periodPath });

        harness.host.putFile(noteletPath, "content", {
          journal: "weekly",
          "journal-date": "2026-05-31",
          "journal-notelet": "Retired",
        });
        harness.resolve(JournalsIndex).register({
          kind: "notelet",
          journalName: "weekly",
          anchor: anchor("2026-05-31"),
          path: noteletPath,
          typeName: "Retired",
          typeId: null,
        });

        harness.host.putFile(movingNoteletPath, "content", {
          journal: "weekly",
          "journal-date": "2026-05-31",
          "journal-notelet": "Standup",
        });
        harness.resolve(JournalsIndex).register({
          kind: "notelet",
          journalName: "weekly",
          anchor: anchor("2026-05-31"),
          path: movingNoteletPath,
          typeName: "Standup",
          typeId: "nt_1" as TypeId,
        });

        // "Retired" matches no configured type, so #noteletMetadataAt yields
        // NoteletTypeNotFoundError and this write fails — logged, never counted. The period
        // note and the "Standup" notelet both move cleanly, so rewritten must count both of
        // them and neither the failure nor a dropped notelet success may go unseen.
        const result = await harness.resolve(NoteConnectionService).reanchorAll(
          "weekly",
          new Map([
            [periodPath, { anchor: anchor("2026-06-08") }],
            [noteletPath, { anchor: anchor("2026-06-01"), noteletTypeName: "Retired" }],
            [movingNoteletPath, { anchor: anchor("2026-06-01"), noteletTypeName: "Standup" }],
          ]),
        );

        expectOk(result);
        expect(result.value.failed).toBe(0);
        expect(result.value.rewritten).toBe(2);
        expect(harness.host.files.get(periodPath)?.frontmatter).toMatchObject({ "journal-date": "2026-06-08" });
        expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ "journal-date": "2026-05-31" });
        expect(harness.host.files.get(movingNoteletPath)?.frontmatter).toMatchObject({ "journal-date": "2026-06-01" });
      });
    });
  });

  describe("reanchor", () => {
    it("rewrites a note the index never accepted", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: weeklyWith() },
      });
      harness.host.putFile("Weeks/W03.md", "", { journal: "weekly", "journal-date": "2026-01-14" });
      // Deliberately not registering in the index — this is a note the index rejected.

      const result = await harness
        .resolve(NoteConnectionService)
        .reanchor("weekly", "Weeks/W03.md" as VaultPath, { anchor: anchor("2026-01-12") });

      expectOk(result);
      expect(harness.host.files.get("Weeks/W03.md")?.frontmatter["journal-date"]).toBe("2026-01-12");
    });

    it("recomputes the period end from config when the target carries no end date", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: weeklyWith({ addStartDate: true, addEndDate: true }) },
      });
      harness.host.putFile("Weeks/W03.md", "", {
        journal: "weekly",
        "journal-date": "2026-01-12",
        "journal-start-date": "2026-01-12",
        "journal-end-date": "2026-01-12",
      });
      // buildMetadata resolves endDate from whatever entry the index holds at the target
      // anchor. Seed a stale one here so the test actually exercises #reanchorOne's strip —
      // without this the index is empty, buildMetadata's endDate is already undefined, and the
      // strip has nothing to do.
      harness.resolve(JournalsIndex).register({
        journalName: "weekly",
        anchor: anchor("2026-01-12"),
        path: "Weeks/other.md" as VaultPath,
        endDate: anchor("2099-01-01"),
      });

      const result = await harness
        .resolve(NoteConnectionService)
        .reanchor("weekly", "Weeks/W03.md" as VaultPath, { anchor: anchor("2026-01-12") });

      expectOk(result);
      const fm = harness.host.files.get("Weeks/W03.md")?.frontmatter;
      expect(fm?.["journal-start-date"]).toBe("2026-01-12");
      expect(fm?.["journal-end-date"]).toBe("2026-01-18");
    });
  });

  describe("journal-wide cascades over notelets", () => {
    let harness: TestHarness;

    const periodPath = "2026-06-01.md" as VaultPath;
    const noteletPath = "Standup 1.md" as VaultPath;

    beforeEach(async () => {
      const daily = fixedJournal("daily", { type: "day" });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: {
              ...daily,
              notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) },
            },
          },
        },
      });
      harness.host.putFile(periodPath, "content", { journal: "daily", "journal-date": "2026-06-01" });
      harness.host.putFile(noteletPath, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Standup",
        "journal-notelet-index": 1,
      });
      const index = harness.resolve(JournalsIndex);
      index.register({ journalName: "daily", anchor: anchor("2026-06-01"), path: periodPath });
      index.register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: noteletPath,
        typeName: "Standup",
        typeId: "nt_1" as TypeId,
        counter: 1,
      });
    });

    it("disconnectAll strips a notelet's whole claim", async () => {
      await harness.resolve(NoteConnectionService).disconnectAll("daily");

      expect(harness.host.files.get(noteletPath)?.frontmatter).toEqual({});
    });

    it("deleteAll trashes a notelet's file", async () => {
      await harness.resolve(NoteConnectionService).deleteAll("daily");

      expect(harness.host.files.has(noteletPath)).toBe(false);
    });

    it("reconnectAll rewrites a notelet's journal claim", async () => {
      await harness.resolve(NoteConnectionService).reconnectAll("daily", "journal");

      expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ journal: "journal" });
    });

    it("renameJournalFieldAll moves the key on both kinds", async () => {
      await harness.resolve(NoteConnectionService).renameJournalFieldAll("daily", "journal-date", "on");

      expect(harness.host.files.get(periodPath)?.frontmatter).toMatchObject({ on: "2026-06-01" });
      expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ on: "2026-06-01" });
    });

    it("renameFieldAll leaves notelets alone, so a journal question's key rename cannot strand a type answer", async () => {
      harness.host.putFile(noteletPath, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Standup",
        mood: "type answer",
      });

      await harness.resolve(NoteConnectionService).renameFieldAll("daily", "mood", "feeling");

      expect(harness.host.files.get(noteletPath)?.frontmatter).toMatchObject({ mood: "type answer" });
    });

    it("reapplyAll rewrites a notelet without period-note keys", async () => {
      const daily = fixedJournal("daily", { type: "day" });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: {
              ...daily,
              frontmatter: { ...daily.frontmatter, addStartDate: true, addEndDate: true },
              notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) },
            },
          },
        },
      });
      harness.host.putFile(noteletPath, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Standup",
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: noteletPath,
        typeName: "Standup",
        typeId: "nt_1" as TypeId,
        counter: 3,
      });

      await harness.resolve(NoteConnectionService).reapplyAll("daily");

      const frontmatter = harness.host.files.get(noteletPath)?.frontmatter ?? {};
      expect(frontmatter).toMatchObject({ "journal-notelet": "Standup", "journal-notelet-index": 3 });
      expect(frontmatter).not.toHaveProperty("journal-start-date");
      expect(frontmatter).not.toHaveProperty("journal-end-date");
    });

    it("reapplyAll skips a notelet whose type is gone", async () => {
      // addStartDate/addEndDate on makes the period-note mutator write bytes onto the notelet if
      // reapplyAll ever mistakes it for a period note — without this, the two mutators write the
      // same journal/journal-date pair and the exact-equality assertion below would pass either way.
      const daily = fixedJournal("daily", { type: "day" });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: { ...daily, frontmatter: { ...daily.frontmatter, addStartDate: true, addEndDate: true } },
          },
        },
      });
      harness.host.putFile(noteletPath, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Retired",
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: noteletPath,
        typeName: "Retired",
        typeId: null,
      });
      // Building a NoteletMetadata with typeId: null and calling writeMutator would also leave
      // the note unwritten — config.notelets[null] misses, writeMutator errors, and #forEach's
      // best-effort handling swallows it. That's attempted-then-discarded, not skipped, and reads
      // identically on updateFrontmatter (never called) and on the resulting frontmatter (also
      // unchanged) — outcome alone can't tell the two apart. Spying on writeMutator pins the
      // mechanism instead: a deliberate skip never calls it for this entry at all.
      const writeMutatorSpy = vi.spyOn(harness.resolve(FrontmatterService), "writeMutator");

      await harness.resolve(NoteConnectionService).reapplyAll("daily");

      expect(writeMutatorSpy).not.toHaveBeenCalled();
      expect(harness.host.files.get(noteletPath)?.frontmatter).toEqual({
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Retired",
      });
    });
  });

  describe("type-scoped walks", () => {
    let harness: TestHarness;

    const standupPath = "Standup 1.md" as VaultPath;
    const recipePath = "Recipe 1.md" as VaultPath;

    beforeEach(async () => {
      const daily = fixedJournal("daily", { type: "day" });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: {
              ...daily,
              notelets: {
                nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup", prompts: [mood] }),
                nt_2: buildNoteletType({ id: "nt_2" as TypeId, name: "Recipe" }),
              },
            },
          },
        },
      });
      const index = harness.resolve(JournalsIndex);
      for (const [path, typeName, typeId] of [
        [standupPath, "Standup", "nt_1"],
        [recipePath, "Recipe", "nt_2"],
      ] as const) {
        harness.host.putFile(path, "content", {
          journal: "daily",
          "journal-date": "2026-06-01",
          "journal-notelet": typeName,
          mood: "kept",
          title: "keep",
        });
        index.register({
          kind: "notelet",
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path,
          typeName,
          typeId: typeId as TypeId,
        });
      }
    });

    it("renameNoteletsOfType rewrites only that type's stored type name", async () => {
      await harness.resolve(NoteConnectionService).renameNoteletsOfType("daily", "Standup", "Daily standup");

      expect(harness.host.files.get(standupPath)?.frontmatter).toMatchObject({ "journal-notelet": "Daily standup" });
      expect(harness.host.files.get(recipePath)?.frontmatter).toMatchObject({ "journal-notelet": "Recipe" });
    });

    it("renameNoteletFieldForType moves the key on that type's notelets only", async () => {
      await harness.resolve(NoteConnectionService).renameNoteletFieldForType("daily", "Standup", "mood", "feeling");

      expect(harness.host.files.get(standupPath)?.frontmatter).toMatchObject({ feeling: "kept" });
      expect(harness.host.files.get(recipePath)?.frontmatter).toMatchObject({ mood: "kept" });
    });

    it("disconnectNoteletsOfType strips only that type's claims", async () => {
      await harness.resolve(NoteConnectionService).disconnectNoteletsOfType("daily", "Standup");

      expect(harness.host.files.get(standupPath)?.frontmatter).toEqual({ title: "keep" });
      expect(harness.host.files.get(recipePath)?.frontmatter).toMatchObject({ journal: "daily", mood: "kept" });
    });

    it("deleteNoteletsOfType trashes only that type's files", async () => {
      await harness.resolve(NoteConnectionService).deleteNoteletsOfType("daily", "Standup");

      expect(harness.host.files.has(standupPath)).toBe(false);
      expect(harness.host.files.has(recipePath)).toBe(true);
    });
  });

  describe("connect as a notelet", () => {
    const SOURCE = "inbox/n.md" as VaultPath;
    const TYPE = "nt_1" as TypeId;
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                notelets: {
                  [TYPE]: buildNoteletType({ id: TYPE, name: "Standup", nameTemplate: "Standup {{notelet_index}}" }),
                },
              },
            ),
          },
        },
      });
      harness.host.putFile(SOURCE, "content");
    });

    it("writes the type key rather than a period claim", async () => {
      const connected = await harness
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE });

      expectOk(connected);
      expect(harness.host.files.get(SOURCE)?.frontmatter).toMatchObject({
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Standup",
      });
    });

    it("assigns the next counter for the period even when nothing is renamed", async () => {
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "other.md" as VaultPath,
        typeName: "Standup",
        typeId: TYPE,
        counter: 4,
      });

      await harness.resolve(NoteConnectionService).connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE });

      expect(harness.host.files.get(SOURCE)?.frontmatter).toMatchObject({ "journal-notelet-index": 5 });
    });

    it("writes no counter for a type that does not number its notelets", async () => {
      const withoutCounter = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                notelets: {
                  [TYPE]: buildNoteletType({
                    id: TYPE,
                    name: "Standup",
                    counter: { enabled: false, frontmatterKey: "journal-notelet-index" },
                  }),
                },
              },
            ),
          },
        },
      });
      withoutCounter.host.putFile(SOURCE, "content");

      await withoutCounter
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE });

      expect(withoutCounter.host.files.get(SOURCE)?.frontmatter).not.toHaveProperty("journal-notelet-index");
    });

    // The period arm refuses an occupied anchor unless override is set. A notelet has no such
    // exclusivity, so the same call must go through with no override and no occupant trashed.
    it("connects onto an anchor a period note already holds, without an override", async () => {
      harness.host.putFile("Journal/2026-06-01.md", "period", { journal: "daily", "journal-date": "2026-06-01" });
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });

      const connected = await harness
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE });

      expectOk(connected);
      expect(harness.host.files.get("Journal/2026-06-01.md")?.frontmatter).toMatchObject({
        journal: "daily",
        "journal-date": "2026-06-01",
      });
    });

    it("refuses a type the journal does not have", async () => {
      const connected = await harness
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: "nt_missing" as TypeId });

      expect(connected.isErr()).toBe(true);
    });

    it("renames the note to the type's rendered name", async () => {
      const connected = await harness
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE, rename: true });

      expectOk(connected);
      expect(connected.value.path).toBe("inbox/Standup 1.md");
      expect(harness.host.files.get("inbox/Standup 1.md")?.frontmatter).toMatchObject({
        "journal-notelet": "Standup",
      });
    });

    it("moves the note into the type's folder, keeping its own name", async () => {
      const inFolder = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { notelets: { [TYPE]: buildNoteletType({ id: TYPE, name: "Standup", folder: "Standups" }) } },
            ),
          },
        },
      });
      inFolder.host.putFile(SOURCE, "content");

      const connected = await inFolder
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE, move: true });

      expectOk(connected);
      expect(connected.value.path).toBe("Standups/n.md");
    });

    // The journal's own name template is irrelevant on this route; reading it would rename the
    // notelet onto the period note's name.
    it("ignores the journal's name template", async () => {
      const differing = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                nameTemplate: "{{date}}",
                notelets: {
                  [TYPE]: buildNoteletType({ id: TYPE, name: "Standup", nameTemplate: "Standup {{notelet_index}}" }),
                },
              },
            ),
          },
        },
      });
      differing.host.putFile(SOURCE, "content");

      const connected = await differing
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE, rename: true });

      expectOk(connected);
      expect(connected.value.path).toBe("inbox/Standup 1.md");
    });

    it("refuses the rename when the type's name template asks a question, but still moves", async () => {
      const prompting = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                notelets: {
                  [TYPE]: buildNoteletType({
                    id: TYPE,
                    name: "Standup",
                    folder: "Standups",
                    nameTemplate: "{{who}}",
                    prompts: [
                      { variable: "who", question: "Who?", type: "text", frontmatterKey: "who", required: false },
                    ],
                  }),
                },
              },
            ),
          },
        },
      });
      prompting.host.putFile(SOURCE, "content");

      const connected = await prompting
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE, rename: true, move: true });

      expectOk(connected);
      expect(connected.value.path).toBe("Standups/n.md");
    });

    it("refuses the move when the type's folder asks a question, but still renames", async () => {
      const prompting = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                notelets: {
                  [TYPE]: buildNoteletType({
                    id: TYPE,
                    name: "Standup",
                    folder: "{{who}}",
                    nameTemplate: "Standup {{notelet_index}}",
                    prompts: [
                      { variable: "who", question: "Who?", type: "text", frontmatterKey: "who", required: false },
                    ],
                  }),
                },
              },
            ),
          },
        },
      });
      prompting.host.putFile(SOURCE, "content");

      const connected = await prompting
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE, rename: true, move: true });

      expectOk(connected);
      expect(connected.value.path).toBe("inbox/Standup 1.md");
    });
  });

  describe("retype", () => {
    const SOURCE = "inbox/n.md" as VaultPath;
    const TYPE = "nt_1" as TypeId;
    const OTHER = "nt_2" as TypeId;
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2026-01-01"),
                  allowBefore: false,
                  sources: [
                    { variable: "day_index", frontmatterKey: "day-index", anchorValue: 1, reset: { kind: "never" } },
                  ],
                },
                notelets: {
                  [TYPE]: buildNoteletType({
                    id: TYPE,
                    name: "Standup",
                    counter: { enabled: true, frontmatterKey: "standup-index" },
                  }),
                  [OTHER]: buildNoteletType({
                    id: OTHER,
                    name: "Retro",
                    counter: { enabled: true, frontmatterKey: "retro-index" },
                  }),
                },
              },
            ),
          },
        },
      });
    });

    function seedNotelet(typeName: string, counterKey: string): void {
      harness.host.putFile(SOURCE, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": typeName,
        [counterKey]: 2,
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: SOURCE,
        typeName,
        typeId: typeName === "Standup" ? TYPE : OTHER,
        counter: 2,
      });
    }

    it("strips the type key when a notelet becomes the period note", async () => {
      seedNotelet("Standup", "standup-index");

      await harness.resolve(NoteConnectionService).connect("daily", SOURCE, anchor("2026-06-01"));

      const frontmatter = harness.host.files.get(SOURCE)?.frontmatter ?? {};
      expect(frontmatter).not.toHaveProperty("journal-notelet");
      expect(frontmatter).not.toHaveProperty("standup-index");
      expect(frontmatter).toMatchObject({ journal: "daily", "journal-date": "2026-06-01" });
    });

    it("strips the losing type's counter when a notelet is retyped", async () => {
      seedNotelet("Standup", "standup-index");

      await harness.resolve(NoteConnectionService).connect("daily", SOURCE, anchor("2026-06-01"), { typeId: OTHER });

      const frontmatter = harness.host.files.get(SOURCE)?.frontmatter ?? {};
      expect(frontmatter).toMatchObject({ "journal-notelet": "Retro", "retro-index": 1 });
      expect(frontmatter).not.toHaveProperty("standup-index");
    });

    it("strips the journal's numbering digits when a period note becomes a notelet", async () => {
      harness.host.putFile(SOURCE, "content", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "day-index": 12,
      });
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: SOURCE,
        numbers: { day_index: 12 },
      });

      await harness.resolve(NoteConnectionService).connect("daily", SOURCE, anchor("2026-06-01"), { typeId: TYPE });

      const frontmatter = harness.host.files.get(SOURCE)?.frontmatter ?? {};
      expect(frontmatter).toMatchObject({ "journal-notelet": "Standup" });
      expect(frontmatter).not.toHaveProperty("day-index");
    });

    it("strips journal A's keys and takes journal B's claim on a cross-journal reconnect", async () => {
      const crossing = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            acme: fixedJournal(
              "acme",
              { type: "day" },
              {
                prompts: [
                  { variable: "note", question: "Note?", type: "text", frontmatterKey: "acme-note", required: false },
                ],
              },
            ),
            beta: fixedJournal(
              "beta",
              { type: "day" },
              {
                prompts: [
                  { variable: "note", question: "Note?", type: "text", frontmatterKey: "beta-note", required: false },
                ],
              },
            ),
          },
        },
      });
      crossing.host.putFile(SOURCE, "content", {
        journal: "acme",
        "journal-date": "2026-06-01",
        "acme-note": "kept while on A",
      });
      crossing.resolve(JournalsIndex).register({
        journalName: "acme",
        anchor: anchor("2026-06-01"),
        path: SOURCE,
      });

      await crossing.resolve(NoteConnectionService).connect("beta", SOURCE, anchor("2026-06-02"));

      const frontmatter = crossing.host.files.get(SOURCE)?.frontmatter ?? {};
      expect(frontmatter).not.toHaveProperty("acme-note");
      expect(frontmatter).toMatchObject({ journal: "beta", "journal-date": "2026-06-02" });
    });

    // A re-date is not a re-claim. Clearing here would take an answer the user typed with it.
    it("keeps a stored answer when only the date changes", async () => {
      const answering = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                prompts: [
                  { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false },
                ],
              },
            ),
          },
        },
      });
      answering.host.putFile(SOURCE, "content", { journal: "daily", "journal-date": "2026-06-01", mood: "good" });
      answering.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: SOURCE,
        answers: { mood: "good" },
      });

      await answering.resolve(NoteConnectionService).connect("daily", SOURCE, anchor("2026-06-02"));

      expect(answering.host.files.get(SOURCE)?.frontmatter).toMatchObject({
        "journal-date": "2026-06-02",
        mood: "good",
      });
    });

    // pathFor deliberately does not suffix past a taken path, so a rendered target that is
    // already on disk fails at the rename — with the old claim still the only one the note has.
    it("leaves the note's original claim in place when the rename collides", async () => {
      seedNotelet("Standup", "standup-index");
      // The name the Retro type renders for this period, beside the note's own folder — the
      // exact path the rename would take, occupied before the connect runs.
      harness.host.putFile("inbox/daily 1.md", "taken");

      const connected = await harness
        .resolve(NoteConnectionService)
        .connect("daily", SOURCE, anchor("2026-06-01"), { typeId: OTHER, rename: true });

      expect(connected.isErr()).toBe(true);
      expect(harness.host.files.get(SOURCE)?.frontmatter).toMatchObject({
        journal: "daily",
        "journal-notelet": "Standup",
        "standup-index": 2,
      });
    });

    // The index only learns of the strip once vault events land. Leaving the stale entry behind
    // lets ensureNote find the note at its old anchor and write the wrong kind back over it.
    it("drops the stale index entry as soon as the claim is stripped", async () => {
      seedNotelet("Standup", "standup-index");

      await harness.resolve(NoteConnectionService).connect("daily", SOURCE, anchor("2026-06-01"));

      expect(harness.resolve(JournalsIndex).noteletsAt("daily", anchor("2026-06-01"))).toHaveLength(0);
    });
  });
});
