import { screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import type { NoteletType, TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import NotePathPreview from "./NotePathPreview.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function withType(overrides: Partial<NoteletType> = {}): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule],
    data: {
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            notelets: {
              nt_7f3a: buildNoteletType({
                id: "nt_7f3a" as TypeId,
                name: "Standup",
                nameTemplate: "Standup {{notelet_index}}",
                ...overrides,
              }),
            },
          },
        ),
      },
    },
  });
}

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

  describe("given a notelet type", () => {
    it("renders the type's own path rather than the journal's", async () => {
      const harness = await withType({ folder: "Meetings" });

      harness.render(NotePathPreview, { props: { journalName: "daily", typeId: "nt_7f3a" } });

      expect(screen.getByText("Meetings/Standup 1.md")).toBeTruthy();
    });

    // The shown path is the one creation would actually take, so a name already in the vault
    // previews with the suffix the notelet would really get.
    it("renders the suffixed path when the rendered name is taken", async () => {
      const harness = await withType();
      harness.host.putFile("Standup 1.md");

      harness.render(NotePathPreview, { props: { journalName: "daily", typeId: "nt_7f3a" } });

      expect(screen.getByText("Standup 1 1.md")).toBeTruthy();
    });

    it("warns when the type's name template resolves to an empty note name", async () => {
      const harness = await withType({ nameTemplate: "" });

      harness.render(NotePathPreview, { props: { journalName: "daily", typeId: "nt_7f3a" } });

      expect(screen.getByText(m.journal_edit_name_template_empty_warning())).toBeTruthy();
    });

    it("renders nothing when the journal no longer has the type", async () => {
      const harness = await withType();

      const { container: dom } = harness.render(NotePathPreview, {
        props: { journalName: "daily", typeId: "nt_gone" },
      });

      expect(dom.textContent ?? "").toBe("");
    });
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
