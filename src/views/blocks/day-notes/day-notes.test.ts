import { describe, expect, it } from "vitest";

import { CalendarDate, periodOfKind, type AnchorString, type PeriodKind } from "@/calendar";
import type { Note, NoteMetadata, VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNotesService } from "@/infrastructure/host/testing";

import { createDayNotesQuery, resolveCreationDate } from "./day-notes";

import type { DayNotesSliceState } from "./slice";

const settings: DayNotesSliceState = { property: "created", format: "YYYY-MM-DD" };

function timestamp(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 10, 30).getTime();
}

function note(path = "Notes/example.md", ctime = timestamp(2026, 5, 20)): Note {
  const vaultPath = path as VaultPath;
  return {
    path: vaultPath,
    basename: path.split("/").at(-1)?.replace(/\.md$/, "") ?? path,
    folder: "Notes" as VaultPath,
    size: 0,
    ctime,
    mtime: ctime,
  };
}

function metadata(properties: Record<string, unknown>): NoteMetadata {
  return { title: "example", tags: [], properties, tasks: [] };
}

describe("resolveCreationDate", () => {
  it("uses a configured string property", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: "2026-05-25" }), settings);
    expect(resolved.toAnchor()).toBe("2026-05-25");
  });

  it("uses the configured date format strictly", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: "25/05/2026" }), {
      property: "created",
      format: "DD/MM/YYYY",
    });
    expect(resolved.toAnchor()).toBe("2026-05-25");
  });

  it("uses a Date property as the local calendar day it represents", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: new Date(2026, 4, 25, 23, 30) }), settings);
    expect(resolved.toAnchor()).toBe("2026-05-25");
  });

  it("accepts a date-time string by retrying the configured-length prefix", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: "2026-05-25T10:30:00Z" }), settings);
    expect(resolved.toAnchor()).toBe("2026-05-25");
  });

  it("falls back to ctime when metadata or the configured property is absent", () => {
    const target = note("Notes/fallback.md", timestamp(2026, 5, 21));
    expect(resolveCreationDate(target, undefined, settings).toAnchor()).toBe("2026-05-21");
    expect(resolveCreationDate(target, metadata({ other: "2026-05-25" }), settings).toAnchor()).toBe("2026-05-21");
  });

  it("falls back to ctime when the configured string is invalid or uses a different format", () => {
    const target = note("Notes/fallback.md", timestamp(2026, 5, 21));
    expect(resolveCreationDate(target, metadata({ created: "not-a-date" }), settings).toAnchor()).toBe("2026-05-21");
    expect(resolveCreationDate(target, metadata({ created: "03/04/2026" }), settings).toAnchor()).toBe("2026-05-21");
  });

  it.each([42, ["2026-05-25"], { date: "2026-05-25" }, new Date(NaN)])(
    "falls back to ctime for unsupported property value %j",
    (value) => {
      const target = note("Notes/fallback.md", timestamp(2026, 5, 21));
      expect(resolveCreationDate(target, metadata({ created: value }), settings).toAnchor()).toBe("2026-05-21");
    },
  );

  it("rejects a note when neither its configured property nor ctime is a valid date", () => {
    const target = note("Notes/broken.md", NaN);

    expect(() => resolveCreationDate(target, metadata({ created: "not-a-date" }), settings)).toThrow(
      new RangeError("Invalid note creation timestamp for Notes/broken.md"),
    );
  });
});

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
});
