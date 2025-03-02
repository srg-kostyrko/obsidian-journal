import type { JournalAnchorDate } from "@/types/journal.types";
import type { GenericConditions } from "@/types/settings.types";

export interface BulkAddPrams {
  folder: string;
  date_place: "title" | "property";
  property_name: string;
  date_format: string;
  filter_combinator: "no" | "and" | "or";
  filters: GenericConditions[];
  existing_note: "skip" | "override" | "merge" | "ask";
  other_folder: "keep" | "move" | "ask";
  other_name: "keep" | "rename" | "ask";
  dry_run: boolean;
}

export interface RelateToExistingNote {
  type: "existing_note";
  other_file: string;
  decision: BulkAddPrams["existing_note"];
}

export interface FolderDifference {
  type: "other_folder";
  configured_folder: string;
  decision: BulkAddPrams["other_folder"];
}

export interface NameDifference {
  type: "other_name";
  configured_name: string;
  decision: BulkAddPrams["other_name"];
}

export type NodeProcessingOperationsWithDecisions = RelateToExistingNote | FolderDifference | NameDifference;

export interface SkippingNote {
  type: "skipping";
  reason: string;
}

export interface ConnectNote {
  type: "connect";
  anchor_date: JournalAnchorDate;
}

export type NodeProcessingOperations = SkippingNote | ConnectNote | NodeProcessingOperationsWithDecisions;

export interface NoteDataForProcessing {
  path: string;
  operations: NodeProcessingOperations[];
}

export interface NoteProcessingResult {
  note: string;
  folder: string;
  path: string;
  actions: string[];
}
