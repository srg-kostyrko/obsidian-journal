import { TFile, TFolder } from "obsidian";
import { describe, expect, it } from "vitest";

import { toNote, toPaneType } from "./obsidian-bridge";

import type { VaultPath } from "../types";

function buildFile(path: string, parentPath: string, basename: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = `${basename}.md`;
  file.basename = basename;
  file.extension = "md";
  const parent = new TFolder();
  parent.path = parentPath;
  parent.name = parentPath.split("/").pop() ?? "";
  file.parent = parent;
  return file;
}

describe("toNote", () => {
  it("maps creation and modification times from TFile.stat", () => {
    const file = buildFile("Daily/2026-05-13.md", "Daily", "2026-05-13");
    file.stat = { ctime: 1_700_000_000_000, mtime: 1_800_000_000_000, size: 12 };
    expect(toNote(file)).toMatchObject({ ctime: 1_700_000_000_000, mtime: 1_800_000_000_000 });
  });

  it("maps path from TFile.path", () => {
    expect(toNote(buildFile("Daily/2026-05-13.md", "Daily", "2026-05-13")).path).toBe("Daily/2026-05-13.md");
  });

  it("maps basename from TFile.basename", () => {
    expect(toNote(buildFile("Daily/2026-05-13.md", "Daily", "2026-05-13")).basename).toBe("2026-05-13");
  });

  it("maps folder from TFile.parent.path", () => {
    expect(toNote(buildFile("Daily/2026-05-13.md", "Daily", "2026-05-13")).folder).toBe("Daily");
  });

  it("returns empty folder when parent is null", () => {
    const file = buildFile("root.md", "", "root");
    file.parent = null;
    expect(toNote(file).folder).toBe("" as VaultPath);
  });
});

describe("toPaneType", () => {
  it("maps 'active' to false", () => {
    expect(toPaneType("active")).toBe(false);
  });

  it("passes 'tab' through unchanged", () => {
    expect(toPaneType("tab")).toBe("tab");
  });

  it("passes 'split' through unchanged", () => {
    expect(toPaneType("split")).toBe("split");
  });

  it("passes 'window' through unchanged", () => {
    expect(toPaneType("window")).toBe("window");
  });
});
