import { TFile, TFolder } from "obsidian";
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { NoteFileService } from "./note-file-service";
import { InternalObsidianAppToken } from "./tokens";

function serviceWith(files: Record<string, TFile | TFolder>): NoteFileService {
  const c = new Container();
  c.register(InternalObsidianAppToken).useValue({
    vault: { getAbstractFileByPath: (path: string) => files[path] ?? null },
  } as never);
  c.register(NoteFileService).useClass(NoteFileService);
  return c.resolve(NoteFileService);
}

function fileAt(path: string): TFile {
  return Object.assign(new TFile(), { path });
}

describe("NoteFileService", () => {
  it("resolves a path to its TFile", () => {
    const file = fileAt("Journal/2026-08-18.md");
    expect(serviceWith({ "Journal/2026-08-18.md": file }).resolve("Journal/2026-08-18.md")).toBe(file);
  });

  it("returns null when nothing is there", () => {
    expect(serviceWith({}).resolve("Journal/missing.md")).toBeNull();
  });

  it("returns null for a folder", () => {
    const folder = Object.assign(new TFolder(), { path: "Journal" });
    expect(serviceWith({ Journal: folder }).resolve("Journal")).toBeNull();
  });
});
