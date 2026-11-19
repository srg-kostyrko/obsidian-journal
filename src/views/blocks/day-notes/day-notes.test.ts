import { describe, expect, it } from "vitest";

import { CalendarDate, periodOfKind, type AnchorString, type PeriodKind } from "@/calendar";
import type { NoteMetadata, VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNotesService } from "@/infrastructure/host/testing";
import type { DayNotesSliceState } from "@/journals/creation-dates";

import { createDayNotesQuery } from "./day-notes";

const settings: DayNotesSliceState = { property: "created", format: "YYYY-MM-DD" };

function timestamp(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 10, 30).getTime();
}

function metadata(properties: Record<string, unknown>): NoteMetadata {
  return { title: "example", tags: [], properties };
}

describe("createDayNotesQuery", () => {
  it("resolves every markdown note and filters by the requested period", () => {
    const notes = new FakeNotesService();
    const noteMetadata = new FakeNoteMetadataService();
    const may = "Notes/may.md" as VaultPath;
    const june = "Notes/june.md" as VaultPath;
    const future = "Notes/future.md" as VaultPath;
    notes.seed(may, "", {}, { ctime: timestamp(2000, 1, 1) });
    notes.seed(june, "", {}, { ctime: timestamp(2026, 6, 2) });
    notes.seed(future, "", {}, { ctime: timestamp(2037, 1, 1) });
    noteMetadata.setMetadata(may, metadata({ created: "2026-05-25" }));

    const query = createDayNotesQuery({ notes, metadata: noteMetadata, settings: () => settings });
    const pathsIn = (kind: PeriodKind, anchor: string): readonly VaultPath[] =>
      query
        .notesCreatedIn(periodOfKind(kind, CalendarDate.fromAnchor(anchor as AnchorString)))
        .map((entry) => entry.note.path);

    expect(pathsIn("day", "2026-05-25")).toEqual([may]);
    expect(pathsIn("month", "2026-05-15")).toEqual([may]);
    expect(pathsIn("quarter", "2026-05-15")).toEqual([may, june]);
    expect(pathsIn("year", "2026-05-15")).toEqual([may, june]);
    expect(pathsIn("decade", "2026-05-15")).toEqual([may, june]);
  });

  it("returns the resolved creation date with each note", () => {
    const notes = new FakeNotesService();
    const noteMetadata = new FakeNoteMetadataService();
    const path = "Notes/example.md" as VaultPath;
    notes.seed(path, "", {}, { ctime: timestamp(2000, 1, 1) });
    noteMetadata.setMetadata(path, metadata({ created: "2026-05-25" }));
    const query = createDayNotesQuery({ notes, metadata: noteMetadata, settings: () => settings });

    const entries = query.notesCreatedIn(periodOfKind("month", CalendarDate.fromAnchor("2026-05-15" as AnchorString)));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.created.toAnchor()).toBe("2026-05-25");
  });

  it("drops a note it cannot date rather than failing the whole listing", () => {
    const notes = new FakeNotesService();
    const noteMetadata = new FakeNoteMetadataService();
    const good = "Notes/good.md" as VaultPath;
    const broken = "Notes/broken.md" as VaultPath;
    notes.seed(good, "", {}, { ctime: timestamp(2026, 5, 25) });
    notes.seed(broken, "", {}, { ctime: NaN, mtime: NaN });
    const query = createDayNotesQuery({ notes, metadata: noteMetadata, settings: () => settings });

    const entries = query.notesCreatedIn(periodOfKind("month", CalendarDate.fromAnchor("2026-05-15" as AnchorString)));

    expect(entries.map((entry) => entry.note.path)).toEqual([good]);
  });
});
