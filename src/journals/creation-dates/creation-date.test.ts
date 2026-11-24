import { describe, expect, it } from "vitest";

import { userDateFormat } from "@/calendar";
import type { Note, NoteMetadata, VaultPath } from "@/infrastructure/host";

import { resolveCreationDate } from "./creation-date";

import type { DayNotesSliceState } from "./slice";

const settings: DayNotesSliceState = { property: "created", format: userDateFormat("YYYY-MM-DD") };

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
  return { title: "example", tags: [], properties };
}

describe("resolveCreationDate", () => {
  it("uses a configured string property", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: "2026-05-25" }), settings);
    expect(resolved?.toAnchor()).toBe("2026-05-25");
  });

  it("uses the configured date format strictly", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: "25/05/2026" }), {
      property: "created",
      format: userDateFormat("DD/MM/YYYY"),
    });
    expect(resolved?.toAnchor()).toBe("2026-05-25");
  });

  it("uses a Date property as the local calendar day it represents", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: new Date(2026, 4, 25, 23, 30) }), settings);
    expect(resolved?.toAnchor()).toBe("2026-05-25");
  });

  it("accepts a date-time string by retrying the configured-length prefix", () => {
    const resolved = resolveCreationDate(note(), metadata({ created: "2026-05-25T10:30:00Z" }), settings);
    expect(resolved?.toAnchor()).toBe("2026-05-25");
  });

  it("falls back to ctime when metadata or the configured property is absent", () => {
    const target = note("Notes/fallback.md", timestamp(2026, 5, 21));
    expect(resolveCreationDate(target, undefined, settings)?.toAnchor()).toBe("2026-05-21");
    expect(resolveCreationDate(target, metadata({ other: "2026-05-25" }), settings)?.toAnchor()).toBe("2026-05-21");
  });

  it("falls back to ctime when the configured string is invalid or uses a different format", () => {
    const target = note("Notes/fallback.md", timestamp(2026, 5, 21));
    expect(resolveCreationDate(target, metadata({ created: "not-a-date" }), settings)?.toAnchor()).toBe("2026-05-21");
    expect(resolveCreationDate(target, metadata({ created: "03/04/2026" }), settings)?.toAnchor()).toBe("2026-05-21");
  });

  it.each([42, ["2026-05-25"], { date: "2026-05-25" }, new Date(NaN)])(
    "falls back to ctime for unsupported property value %j",
    (value) => {
      const target = note("Notes/fallback.md", timestamp(2026, 5, 21));
      expect(resolveCreationDate(target, metadata({ created: value }), settings)?.toAnchor()).toBe("2026-05-21");
    },
  );

  it("falls back to mtime when ctime is not a usable timestamp", () => {
    const target = { ...note("Notes/broken.md", NaN), mtime: timestamp(2026, 5, 21) };

    expect(resolveCreationDate(target, metadata({ created: "not-a-date" }), settings)?.toAnchor()).toBe("2026-05-21");
  });

  it("dates a note by nothing when neither its property, ctime, nor mtime is usable", () => {
    const target = { ...note("Notes/broken.md", NaN), mtime: NaN };

    expect(resolveCreationDate(target, metadata({ created: "not-a-date" }), settings)).toBeNull();
  });

  it("treats a zero ctime as unknown and dates the note by mtime", () => {
    const target = { ...note(), ctime: 0, mtime: timestamp(2026, 5, 21) };

    expect(resolveCreationDate(target, undefined, settings)?.toAnchor()).toBe("2026-05-21");
  });

  it("drops a note whose ctime and mtime are both zero", () => {
    expect(resolveCreationDate({ ...note(), ctime: 0, mtime: 0 }, undefined, settings)).toBeNull();
  });
});
