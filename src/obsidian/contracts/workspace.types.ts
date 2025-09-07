import type { PaneType, Side, WorkspaceLeaf } from "obsidian";
import type { Option } from "@/infra/data-structures/option";
import type { AsyncResult } from "@/infra/data-structures/result";
import type { WorkspaceError } from "../errors/workspace.error";
import type { FilePath } from "./vault.types";
import type { Brand } from "@/types/utility.types";

export type LeafType = Brand<string, "LeafType">;
export function LeafType(path: string): LeafType {
  return path as LeafType;
}

export const MARKDOWN_LEAF_TYPE = LeafType("markdown");

export interface Workspace {
  readonly isLayoutReady: boolean;
  readonly layoutReady: Promise<void>;

  readonly activeFile: Option<FilePath>;

  getLeavesOfType(type: LeafType): WorkspaceLeaf[];
  getLeafOfType(type: LeafType): Option<WorkspaceLeaf>;
  getLeaf(newLeaf?: PaneType | boolean): WorkspaceLeaf;

  setActiveLeaf(leaf: WorkspaceLeaf, focus?: boolean): void;
  ensureSideLeaf(type: LeafType, side: Side): AsyncResult<WorkspaceLeaf, WorkspaceError>;

  detachLeavesOfType(type: LeafType): void;

  findOpenedNote(path: FilePath): Option<WorkspaceLeaf>;

  showContextMenu(path: FilePath, event: MouseEvent): void;
  showPreview(path: FilePath, event: MouseEvent): void;
}
