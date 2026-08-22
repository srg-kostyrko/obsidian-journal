import { screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import NotePathPreview from "./NotePathPreview.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("NotePathPreview", () => {
  describe("with a plain daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("renders today's resolved path for a journal with no folder", () => {
      harness.render(NotePathPreview, { props: { journalName: "daily" } });

      expect(screen.getByText("2026-05-19.md")).toBeTruthy();
    });

    it("updates reactively when the journal's nameTemplate changes", async () => {
      harness.render(NotePathPreview, { props: { journalName: "daily" } });

      harness.resolve(JournalsRepository).update("daily", { nameTemplate: "note-{{date}}" });

      await waitFor(() => {
        expect(screen.getByText("note-2026-05-19.md")).toBeTruthy();
      });
    });

    it("updates reactively when the journal's folder changes", async () => {
      harness.render(NotePathPreview, { props: { journalName: "daily" } });

      harness.resolve(JournalsRepository).update("daily", { folder: "Diary" });

      await waitFor(() => {
        expect(screen.getByText("Diary/2026-05-19.md")).toBeTruthy();
      });
    });

    it("renders nothing when the journal no longer exists", () => {
      const { container: dom } = harness.render(NotePathPreview, { props: { journalName: "ghost" } });

      expect(dom.textContent ?? "").toBe("");
    });
  });

  it("prefixes the resolved note name with the resolved folder", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journals/{{date:YYYY}}" }) } },
    });
    harness.render(NotePathPreview, { props: { journalName: "daily" } });

    expect(screen.getByText("Journals/2026/2026-05-19.md")).toBeTruthy();
  });

  it("resolves a folder that consumes the rendered note name", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journals/{{note_name}}" }) } },
    });
    harness.render(NotePathPreview, { props: { journalName: "daily" } });

    expect(screen.getByText("Journals/2026-05-19/2026-05-19.md")).toBeTruthy();
  });

  it("warns when the name template resolves to an empty note name", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) } },
    });
    harness.render(NotePathPreview, { props: { journalName: "daily" } });

    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });

  it("warns when the name template renders only whitespace", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: " ".repeat(3) }) } },
    });
    harness.render(NotePathPreview, { props: { journalName: "daily" } });

    expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
  });
});
