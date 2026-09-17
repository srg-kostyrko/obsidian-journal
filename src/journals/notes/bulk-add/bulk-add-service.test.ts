import { beforeEach, describe, expect, it, vi } from "vitest";

import { localMoment } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { InvariantError } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";
import { journalsCoreModule } from "../../module";
import { buildNoteletType, fixedJournal } from "../../testing";
import { NoteConnectionService } from "../note-connection";

import { BulkAddService } from "./bulk-add-service";
import { defaultBulkAddParameters } from "./config";

import type { PlannedAction } from "./bulk-add-service";
import type { BulkAddParameters } from "./config";
import type { TypeId } from "../../notelets/config";
import type { Prompt } from "../../prompts/config";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

function plannedAction(overrides: Partial<PlannedAction> = {}): PlannedAction {
  return {
    kind: "action",
    path: "src/note.md" as VaultPath,
    anchor: anchor("2026-06-01"),
    targetPath: "src/note.md" as VaultPath,
    existing: "none",
    folder: "n/a",
    name: "n/a",
    ...overrides,
  };
}

function makeParameters(overrides: Partial<BulkAddParameters> = {}): BulkAddParameters {
  return { ...defaultBulkAddParameters(), ...overrides };
}

describe("BulkAddService", () => {
  describe("plan", () => {
    describe("with the daily journal filed under Journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }) } },
        });
      });

      it("skips a note that is already connected", async () => {
        harness.host.putFile("src/2026-06-01.md");
        harness.resolve(JournalsIndex).register({
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path: "src/2026-06-01.md" as VaultPath,
        });

        const planResult = await harness.resolve(BulkAddService).plan("daily", makeParameters({ folder: "src" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note).toEqual({ kind: "skip", path: "src/2026-06-01.md", reason: "already-connected" });
      });

      it("skips a note that fails the filters", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness.resolve(BulkAddService).plan(
          "daily",
          makeParameters({
            folder: "src",
            filterCombinator: "and",
            filters: [{ type: "title", condition: "contains", value: "meeting" }],
          }),
        );

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "skip" && note.reason).toBe("filtered");
      });

      it("skips a note whose title has no parseable date", async () => {
        harness.host.putFile("src/hello.md");

        const planResult = await harness.resolve(BulkAddService).plan("daily", makeParameters({ folder: "src" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/hello.md");
        expect(note?.kind === "skip" && note.reason).toBe("no-date");
      });

      it("plans a connect action resolving the folder decision from params", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", otherFolder: "move" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind).toBe("action");
        expect(note?.kind === "action" && note.anchor).toBe("2026-06-01");
        expect(note?.kind === "action" && note.folder).toBe("move"); // src != configured "Journal"
      });

      it("ignores a date-named attachment in the source folder", async () => {
        harness.host.putFile("src/2026-06-01.pdf");

        const planResult = await harness.resolve(BulkAddService).plan("daily", makeParameters({ folder: "src" }));

        expectOk(planResult);
        expect(planResult.value.notes.find((n) => n.path === "src/2026-06-01.pdf")).toBeUndefined();
      });

      it("skips a note whose date string cannot be parsed", async () => {
        harness.host.putFile("src/2026-06-45.md");

        const planResult = await harness.resolve(BulkAddService).plan("daily", makeParameters({ folder: "src" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-45.md");
        expect(note?.kind === "skip" && note.reason).toBe("invalid-date");
      });

      it("skips a property-dated note when the property is missing", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", datePlace: "property", propertyName: "when" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "skip" && note.reason).toBe("no-date");
      });

      // Importers write a timestamp, so the format a user types is the one the property visibly holds.
      it.each(["YYYY-MM-DDTHH:mm", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD h:mm a"])(
        "reads a property holding a time of day with the format %s",
        async (dateFormat) => {
          const value = localMoment("2026-06-01 21:31", "YYYY-MM-DD HH:mm", true).format(dateFormat);
          harness.host.putFile("src/entry.md", "", { creationDate: value });

          const planResult = await harness
            .resolve(BulkAddService)
            .plan(
              "daily",
              makeParameters({ folder: "src", datePlace: "property", propertyName: "creationDate", dateFormat }),
            );

          expectOk(planResult);
          const note = planResult.value.notes.find((n) => n.path === "src/entry.md");
          expect(note?.kind === "action" && note.anchor).toBe("2026-06-01");
        },
      );

      it("marks the existing-note decision as ask when an occupant exists and params say ask", async () => {
        harness.host.putFile("Journal/2026-06-01.md", "", {
          journal: "daily",
          "journal-date": "2026-06-01",
        });
        harness.resolve(JournalsIndex).register({
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path: "Journal/2026-06-01.md" as VaultPath,
        });
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", existingNote: "ask" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "action" && note.occupant).toBe("Journal/2026-06-01.md");
        expect(note?.kind === "action" && note.existing).toBe("ask");
      });
    });

    it("keeps the note's current path when the configured path cannot resolve", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal", nameTemplate: "" }) } },
      });
      harness.host.putFile("src/2026-06-01.md");

      const planResult = await harness.resolve(BulkAddService).plan("daily", makeParameters({ folder: "src" }));

      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note?.kind === "action" && note.targetPath).toBe("src/2026-06-01.md");
    });

    describe("with a journal that has a prompt in its name template", () => {
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

      it("reports a refused rename in the bulk plan rather than dropping it silently", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", otherName: "rename" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "action" && note.name).toBe("refused-prompt");
      });

      it("still honors the move decision when only the name template carries a prompt", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", otherFolder: "move" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "action" && note.folder).toBe("move");
      });

      it("keeps the note's own name in the shown target path", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", otherFolder: "move", otherName: "rename" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "action" && note.targetPath).toBe("Journal/2026-06-01.md");
      });
    });

    describe("with a journal that has a prompt in its folder template", () => {
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

      it("reports a refused move in the bulk plan rather than dropping it silently", async () => {
        harness.host.putFile("src/2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", otherFolder: "move" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
        expect(note?.kind === "action" && note.folder).toBe("refused-prompt");
      });

      it("still honors the rename decision when only the folder template carries a prompt", async () => {
        harness.host.putFile("src/journal-2026-06-01.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "src", otherName: "rename" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "src/journal-2026-06-01.md");
        expect(note?.kind === "action" && note.name).toBe("rename");
      });
    });

    it("reads a week-year date out of a title named the Periodic Notes way", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { weekly: fixedJournal("weekly", { type: "week" }) } },
      });
      // ISO week 1 of 2026 starts in the previous calendar year, so only the week-year names it.
      harness.host.putFile("src/2026-W01.md");

      const planResult = await harness
        .resolve(BulkAddService)
        .plan("weekly", makeParameters({ folder: "src", dateFormat: "gggg-[W]ww" }));

      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-W01.md");
      expect(note?.kind === "action" && note.anchor).toBe("2025-12-29");
    });

    it("skips a note whose date is outside the journal's timeline", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { folder: "Journal", timeline: { start: anchor("2027-01-01"), end: { kind: "never" } } },
            ),
          },
        },
      });
      harness.host.putFile("src/2026-06-01.md");

      const planResult = await harness.resolve(BulkAddService).plan("daily", makeParameters({ folder: "src" }));

      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "src/2026-06-01.md");
      expect(note?.kind === "skip" && note.reason).toBe("out-of-bounds");
    });

    describe("reading the date from the note's path", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal(
                "daily",
                { type: "day" },
                { folder: "Journal/{{date:YYYY}}/{{date:MM-MMM}}", nameTemplate: "{{date:DD-ddd}}" },
              ),
            },
          },
        });
      });

      it("connects a note filed under its year and month folders", async () => {
        harness.host.putFile("Journal/2026/06-Jun/01-Mon.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "Journal", datePlace: "path", dateFormat: "" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "Journal/2026/06-Jun/01-Mon.md");
        expect(note).toMatchObject({ kind: "action", anchor: "2026-06-01", folder: "n/a", name: "n/a" });
      });

      it("skips a note whose name matches but whose folder does not", async () => {
        harness.host.putFile("Journal/misfiled/01-Mon.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "Journal", datePlace: "path", dateFormat: "" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "Journal/misfiled/01-Mon.md");
        expect(note?.kind === "skip" && note.reason).toBe("not-on-journal-path");
      });

      it("defers to the existing-note decision when the period already has a note", async () => {
        harness.resolve(JournalsIndex).register({
          journalName: "daily",
          anchor: anchor("2026-06-01"),
          path: "Inbox/june-first.md" as VaultPath,
        });
        harness.host.putFile("Journal/2026/06-Jun/01-Mon.md");

        const planResult = await harness
          .resolve(BulkAddService)
          .plan("daily", makeParameters({ folder: "Journal", datePlace: "path", dateFormat: "", existingNote: "ask" }));

        expectOk(planResult);
        const note = planResult.value.notes.find((n) => n.path === "Journal/2026/06-Jun/01-Mon.md");
        expect(note).toMatchObject({ kind: "action", occupant: "Inbox/june-first.md", existing: "ask" });
      });

      it("refuses to read a notelet's date from its path", () => {
        expect(() =>
          harness.resolve(BulkAddService).plan(
            "daily",
            makeParameters({
              folder: "Journal",
              datePlace: "path",
              dateFormat: "",
              noteletTypeId: "nt_1" as TypeId,
            }),
          ),
        ).toThrow(InvariantError);
      });
    });

    it("connects a monthly note filed under its year folder and named by month", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            monthly: fixedJournal(
              "monthly",
              { type: "month" },
              { folder: "Journal/{{date:YYYY}}", nameTemplate: "{{date:MM-MMM}}" },
            ),
          },
        },
      });
      harness.host.putFile("Journal/2026/06-Jun.md");

      const planResult = await harness
        .resolve(BulkAddService)
        .plan("monthly", makeParameters({ folder: "Journal", datePlace: "path", dateFormat: "" }));

      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "Journal/2026/06-Jun.md");
      expect(note).toMatchObject({ kind: "action", anchor: "2026-06-01" });
    });

    it("skips a path-read note whose date is outside the journal's timeline", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                folder: "Journal/{{date:YYYY}}/{{date:MM-MMM}}",
                nameTemplate: "{{date:DD-ddd}}",
                timeline: { start: anchor("2027-01-01"), end: { kind: "never" } },
              },
            ),
          },
        },
      });
      harness.host.putFile("Journal/2026/06-Jun/01-Mon.md");

      const planResult = await harness
        .resolve(BulkAddService)
        .plan("daily", makeParameters({ folder: "Journal", datePlace: "path", dateFormat: "" }));

      expectOk(planResult);
      const note = planResult.value.notes.find((n) => n.path === "Journal/2026/06-Jun/01-Mon.md");
      expect(note?.kind === "skip" && note.reason).toBe("out-of-bounds");
    });
  });

  describe("resolve", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
    });

    it("keeps the path and anchor from the planned action", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, anchor: anchor("2026-06-10") });

      const [resolved] = harness.resolve(BulkAddService).resolve([action], { existing: {}, folder: {}, name: {} });

      expect(resolved).toMatchObject({ path: "src/note.md", anchor: "2026-06-10" });
    });

    it("defaults an ask existing decision to skip when no choice was made", () => {
      const action = plannedAction({ existing: "ask" });

      const [resolved] = harness.resolve(BulkAddService).resolve([action], { existing: {}, folder: {}, name: {} });

      expect(resolved?.existing).toBe("skip");
    });

    it("resolves an ask existing decision to the chosen value", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, existing: "ask" });

      const [resolved] = harness
        .resolve(BulkAddService)
        .resolve([action], { existing: { "src/note.md": "merge" }, folder: {}, name: {} });

      expect(resolved?.existing).toBe("merge");
    });

    it("keeps a plan-decided existing value without consulting the decision map", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, existing: "override" });

      const [resolved] = harness
        .resolve(BulkAddService)
        .resolve([action], { existing: { "src/note.md": "skip" }, folder: {}, name: {} });

      expect(resolved?.existing).toBe("override");
    });

    it("resolves an ask folder decision to move only when chosen", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, folder: "ask" });

      const [resolved] = harness
        .resolve(BulkAddService)
        .resolve([action], { existing: {}, folder: { "src/note.md": "move" }, name: {} });

      expect(resolved?.move).toBe(true);
    });

    it("keeps a plan-decided move flag without consulting the folder decision map", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, folder: "move" });

      const [resolved] = harness
        .resolve(BulkAddService)
        .resolve([action], { existing: {}, folder: { "src/note.md": "keep" }, name: {} });

      expect(resolved?.move).toBe(true);
    });

    it("resolves an ask name decision to rename only when chosen", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, name: "ask" });

      const [resolved] = harness
        .resolve(BulkAddService)
        .resolve([action], { existing: {}, folder: {}, name: { "src/note.md": "rename" } });

      expect(resolved?.rename).toBe(true);
    });

    it("keeps a plan-decided rename flag without consulting the name decision map", () => {
      const action = plannedAction({ path: "src/note.md" as VaultPath, name: "rename" });

      const [resolved] = harness
        .resolve(BulkAddService)
        .resolve([action], { existing: {}, folder: {}, name: { "src/note.md": "keep" } });

      expect(resolved?.rename).toBe(true);
    });
  });

  describe("apply", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal" }) } },
      });
    });

    it("connects a note with move and rename when resolved that way", async () => {
      harness.host.putFile("src/note.md", "body");

      const logResult = await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        false,
      );

      expectOk(logResult);
      const log = logResult.value;
      expect(harness.host.files.has("src/note.md")).toBe(false);
      expect(harness.host.files.has("Journal/2026-06-01.md")).toBe(true);
      expect(log[0]?.path).toBe("src/note.md");
    });

    it("moves but does not rename a note whose rename was refused for a prompt in its name template", async () => {
      harness.host.putFile("src/note.md", "body");

      const logResult = await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: false,
            renameRefused: true,
          },
        ],
        false,
      );

      expectOk(logResult);
      expect(harness.host.files.has("src/note.md")).toBe(false);
      expect(harness.host.files.has("Journal/note.md")).toBe(true);
      expect(logResult.value[0]?.actions).toContainEqual({ kind: "rename-refused-prompt" });
    });

    it("renames but does not move a note whose move was refused for a prompt in its folder template", async () => {
      harness.host.putFile("src/note.md", "body");

      const logResult = await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: false,
            moveRefused: true,
            rename: true,
          },
        ],
        false,
      );

      expectOk(logResult);
      expect(harness.host.files.has("src/note.md")).toBe(false);
      expect(harness.host.files.has("src/2026-06-01.md")).toBe(true);
      expect(logResult.value[0]?.actions).toContainEqual({ kind: "move-refused-prompt" });
    });

    it("reports progress after each note as it is applied", async () => {
      harness.host.putFile("src/a.md", "a");
      harness.host.putFile("src/b.md", "b");
      const progress: { done: number; total: number }[] = [];

      await harness.resolve(BulkAddService).apply(
        "daily",
        [
          { path: "src/a.md" as VaultPath, anchor: anchor("2026-06-01"), existing: "none", move: false, rename: false },
          { path: "src/b.md" as VaultPath, anchor: anchor("2026-06-02"), existing: "none", move: false, rename: false },
        ],
        true,
        (done, total) => progress.push({ done, total }),
      );

      expect(progress).toEqual([
        { done: 1, total: 2 },
        { done: 2, total: 2 },
      ]);
    });

    it("merges into the occupant and deletes the source", async () => {
      harness.host.putFile("Journal/2026-06-01.md", "OCCUPANT", {
        journal: "daily",
        "journal-date": "2026-06-01",
      });
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });
      harness.host.putFile("src/note.md", "SOURCE");

      await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "merge",
            move: false,
            rename: false,
          },
        ],
        false,
      );

      expect(harness.host.files.has("src/note.md")).toBe(false);
      expect(harness.host.files.get("Journal/2026-06-01.md")?.content).toContain("SOURCE");
    });

    it("performs no file changes in dry-run but still logs intended actions", async () => {
      harness.host.putFile("src/note.md", "body");

      const logResult = await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        true,
      );

      expectOk(logResult);
      const log = logResult.value;
      expect(harness.host.files.has("src/note.md")).toBe(true);
      expect(harness.host.files.has("Journal/2026-06-01.md")).toBe(false);
      expect(log[0]?.actions.length).toBeGreaterThan(0);
    });

    it("reports the intended actions as data the caller can word for a dry run", async () => {
      harness.host.putFile("src/note.md", "body");

      const logResult = await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
        ],
        true,
      );

      expectOk(logResult);
      expect(logResult.value[0]?.actions).toEqual([
        { kind: "moved" },
        { kind: "renamed" },
        { kind: "connected", journalName: "daily", anchor: anchor("2026-06-01") },
      ]);
    });

    it("skips a note resolved as existing skip", async () => {
      harness.host.putFile("src/note.md", "body");

      await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/note.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "skip",
            move: false,
            rename: false,
          },
        ],
        false,
      );

      expect(harness.host.files.has("src/note.md")).toBe(true);
      expect(harness.host.files.has("Journal/2026-06-01.md")).toBe(false);
    });

    it("records a per-note error without aborting the batch", async () => {
      harness.host.putFile("src/ok.md", "body");

      const logResult = await harness.resolve(BulkAddService).apply(
        "daily",
        [
          {
            path: "src/missing.md" as VaultPath,
            anchor: anchor("2026-06-01"),
            existing: "none",
            move: true,
            rename: true,
          },
          {
            path: "src/ok.md" as VaultPath,
            anchor: anchor("2026-06-02"),
            existing: "none",
            move: false,
            rename: false,
          },
        ],
        false,
      );

      expectOk(logResult);
      const log = logResult.value;
      expect(log).toHaveLength(2);
      expect(log[1]?.path).toBe("src/ok.md");
    });
  });

  describe("bulk adding notelets", () => {
    const TYPE = "nt_1" as TypeId;
    const NO_COUNTER_TYPE = "nt_2" as TypeId;
    const EMPTY_DECISIONS = { existing: {}, folder: {}, name: {} };
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
                  [TYPE]: buildNoteletType({
                    id: TYPE,
                    name: "Standup",
                    folder: "Standups",
                    nameTemplate: "Standup {{notelet_index}}",
                  }),
                  [NO_COUNTER_TYPE]: buildNoteletType({
                    id: NO_COUNTER_TYPE,
                    name: "Uncounted",
                    folder: "Standups",
                    nameTemplate: "Uncounted",
                    counter: { enabled: false, frontmatterKey: "journal-notelet-index" },
                  }),
                },
              },
            ),
          },
        },
      });
      harness.host.putFolder("inbox");
    });

    function parameters(overrides: Partial<BulkAddParameters> = {}): BulkAddParameters {
      return { ...defaultBulkAddParameters(), folder: "inbox", noteletTypeId: TYPE, ...overrides };
    }

    it("never reports an occupant, even where a period note holds the anchor", async () => {
      harness.host.putFile("Journal/2026-06-01.md", "period", { journal: "daily", "journal-date": "2026-06-01" });
      harness.resolve(JournalsIndex).register({
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "Journal/2026-06-01.md" as VaultPath,
      });
      harness.host.putFile("inbox/2026-06-01.md", "");

      const plan = await harness.resolve(BulkAddService).plan("daily", parameters());

      expectOk(plan);
      const action = plan.value.notes.at(0);
      expect(action).toMatchObject({ kind: "action", existing: "none" });
      expect(action).not.toHaveProperty("occupant");
    });

    it("targets the type's folder and name", async () => {
      harness.host.putFile("inbox/2026-06-01.md", "");

      const plan = await harness
        .resolve(BulkAddService)
        .plan("daily", parameters({ otherFolder: "move", otherName: "rename" }));

      expectOk(plan);
      expect(plan.value.notes.at(0)).toMatchObject({ targetPath: "Standups/Standup 1.md" });
    });

    // The index cannot advance during planning either, so a per-note nextIndex would preview
    // every note of a period at the same number — and dryRun is on by default, making that
    // wrong report the first thing anyone sees.
    it("previews a distinct number for each note of one period, and writes the ones it previewed", async () => {
      harness.host.putFile("inbox/first 2026-06-01.md", "");
      harness.host.putFile("inbox/second 2026-06-01.md", "");
      harness.host.putFile("inbox/third 2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);

      const plan = await service.plan("daily", parameters({ otherFolder: "move", otherName: "rename" }));

      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");
      expect(actions.map((action) => action.targetPath)).toEqual([
        "Standups/Standup 1.md",
        "Standups/Standup 2.md",
        "Standups/Standup 3.md",
      ]);

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, TYPE);

      for (const [index, action] of actions.entries()) {
        expect(harness.host.files.get(action.targetPath)?.frontmatter).toMatchObject({
          "journal-notelet-index": index + 1,
        });
      }
    });

    // Plan and apply only agree while both allocate for exactly the notes that become actions.
    it("spends no number on a note the plan skips", async () => {
      harness.host.putFile("inbox/connected 2026-06-01.md", "", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Standup",
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "inbox/connected 2026-06-01.md" as VaultPath,
        typeName: "Standup",
        typeId: TYPE,
      });
      harness.host.putFile("inbox/fresh 2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);

      const plan = await service.plan("daily", parameters({ otherFolder: "move", otherName: "rename" }));

      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");
      expect(actions.map((action) => action.targetPath)).toEqual(["Standups/Standup 1.md"]);

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, TYPE);

      expect(harness.host.files.get("Standups/Standup 1.md")?.frontmatter).toMatchObject({
        "journal-notelet-index": 1,
      });
    });

    it("refuses the rename for a type whose name template asks a question", async () => {
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
                    folder: "inbox",
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
      prompting.host.putFolder("inbox");
      prompting.host.putFile("inbox/2026-06-01.md", "");

      const plan = await prompting.resolve(BulkAddService).plan("daily", parameters({ otherName: "rename" }));

      expectOk(plan);
      expect(plan.value.notes.at(0)).toMatchObject({ name: "refused-prompt", targetPath: "inbox/2026-06-01.md" });
    });

    it("skips a note either kind of claim already owns", async () => {
      harness.host.putFile("inbox/2026-06-01.md", "", {
        journal: "daily",
        "journal-date": "2026-06-01",
        "journal-notelet": "Standup",
      });
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "inbox/2026-06-01.md" as VaultPath,
        typeName: "Standup",
        typeId: TYPE,
      });

      const plan = await harness.resolve(BulkAddService).plan("daily", parameters());

      expectOk(plan);
      expect(plan.value.notes.at(0)).toMatchObject({ kind: "skip", reason: "already-connected" });
    });

    it("connects each note as a notelet of the type", async () => {
      harness.host.putFile("inbox/2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);
      const plan = await service.plan("daily", parameters());
      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, TYPE);

      expect(harness.host.files.get("inbox/2026-06-01.md")?.frontmatter).toMatchObject({
        journal: "daily",
        "journal-notelet": "Standup",
      });
    });

    // The index cannot advance mid-run, so a per-note nextIndex would hand every note the same
    // number — and, with the counter in the name template, the same name.
    it("numbers notes of one period in scan order", async () => {
      harness.host.putFile("inbox/first 2026-06-01.md", "");
      harness.host.putFile("inbox/second 2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);
      const plan = await service.plan("daily", parameters());
      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, TYPE);

      const first = actions.at(0)?.path ?? ("" as VaultPath);
      const second = actions.at(1)?.path ?? ("" as VaultPath);
      expect(harness.host.files.get(first)?.frontmatter).toMatchObject({ "journal-notelet-index": 1 });
      expect(harness.host.files.get(second)?.frontmatter).toMatchObject({ "journal-notelet-index": 2 });
    });

    it("continues the period's existing numbering", async () => {
      harness.resolve(JournalsIndex).register({
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-06-01"),
        path: "elsewhere.md" as VaultPath,
        typeName: "Standup",
        typeId: TYPE,
        counter: 7,
      });
      harness.host.putFile("inbox/2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);
      const plan = await service.plan("daily", parameters());
      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, TYPE);

      expect(harness.host.files.get("inbox/2026-06-01.md")?.frontmatter).toMatchObject({
        "journal-notelet-index": 8,
      });
    });

    it("restarts numbering in each period", async () => {
      harness.host.putFile("inbox/2026-06-01.md", "");
      harness.host.putFile("inbox/2026-06-02.md", "");
      const service = harness.resolve(BulkAddService);
      const plan = await service.plan("daily", parameters());
      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, TYPE);

      expect(harness.host.files.get("inbox/2026-06-01.md")?.frontmatter).toMatchObject({
        "journal-notelet-index": 1,
      });
      expect(harness.host.files.get("inbox/2026-06-02.md")?.frontmatter).toMatchObject({
        "journal-notelet-index": 1,
      });
    });

    it("writes nothing on a dry run", async () => {
      harness.host.putFile("inbox/2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);
      const plan = await service.plan("daily", parameters());
      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), true, undefined, TYPE);

      expect(harness.host.files.get("inbox/2026-06-01.md")?.frontmatter).toEqual({});
    });

    it("gives no counter key to a type whose counter is disabled", async () => {
      harness.host.putFile("inbox/2026-06-01.md", "");
      const service = harness.resolve(BulkAddService);
      const connectSpy = vi.spyOn(harness.resolve(NoteConnectionService), "connect");
      const plan = await service.plan("daily", parameters({ noteletTypeId: NO_COUNTER_TYPE }));
      expectOk(plan);
      const actions = plan.value.notes.filter((n): n is PlannedAction => n.kind === "action");

      await service.apply("daily", service.resolve(actions, EMPTY_DECISIONS), false, undefined, NO_COUNTER_TYPE);

      // connect() itself also refuses to honor a stray counter for a disabled-counter type, so
      // the frontmatter alone can't tell apart "never offered one" from "offered and ignored" —
      // assert on the options bulk-add itself builds, not just their downstream effect.
      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(connectSpy.mock.calls.at(0)?.at(3)).not.toHaveProperty("counter");
      expect(harness.host.files.get("inbox/2026-06-01.md")?.frontmatter).not.toHaveProperty("journal-notelet-index");
    });
  });
});
