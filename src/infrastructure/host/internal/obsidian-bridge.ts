import type { Note, OpenMode, VaultPath } from "../types";
import type { PaneType, TFile } from "obsidian";

export function toNote(file: TFile): Note {
  return {
    path: file.path as VaultPath,
    basename: file.basename,
    folder: (file.parent?.path ?? "") as VaultPath,
  };
}

export function toPaneType(mode: OpenMode): PaneType | false {
  if (mode === "active") return false;
  return mode;
}
