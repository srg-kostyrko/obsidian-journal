import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { expectOk } from "@/infrastructure/result/testing";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../../journals-index";
import { journalsCoreModule } from "../../module";
import { fixedJournal } from "../../testing";

import { BulkAddService } from "./bulk-add-service";
import { defaultBulkAddParameters } from "./config";

import type { PlannedAction } from "./bulk-add-service";
import type { BulkAddParameters } from "./config";
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
});
