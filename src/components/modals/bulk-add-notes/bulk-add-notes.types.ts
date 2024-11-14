import type { GenericConditions } from "@/types/settings.types";
import type { TFile } from "obsidian";

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

type NodeProcessingOperations =
  | {
      type: "skiping";
      reason: string;
    }
  | {
      type: "existing_note";
      other_file: TFile;
      desision: BulkAddPrams["existing_note"];
    }
  | {
      type: "other_folder";
      configured_folder: string;
      desision: BulkAddPrams["other_folder"];
    }
  | {
      type: "other_name";
      configured_name: string;
      desision: BulkAddPrams["other_name"];
    }
  | {
      type: "connect";
      anchor_date: string;
    };

export interface NoteDataForProcessing {
  file: TFile;
  operations: NodeProcessingOperations[];
}
