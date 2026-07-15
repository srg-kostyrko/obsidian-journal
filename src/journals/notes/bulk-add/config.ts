import * as v from "valibot";

import { filterConditionSchema, type FilterCondition } from "@/decorations/config";
import { m } from "@/i18n";

export type DatePlace = "title" | "property";
export type FilterCombinator = "no" | "and" | "or";
export type ExistingNoteParameter = "skip" | "override" | "merge" | "ask";
export type OtherFolderParameter = "keep" | "move" | "ask";
export type OtherNameParameter = "keep" | "rename" | "ask";

export interface BulkAddParameters {
  folder: string;
  datePlace: DatePlace;
  propertyName: string;
  dateFormat: string;
  filterCombinator: FilterCombinator;
  filters: FilterCondition[];
  existingNote: ExistingNoteParameter;
  otherFolder: OtherFolderParameter;
  otherName: OtherNameParameter;
  dryRun: boolean;
}

export const bulkAddParametersSchema = v.pipe(
  v.object({
    folder: v.string(),
    datePlace: v.picklist(["title", "property"]),
    propertyName: v.string(),
    dateFormat: v.pipe(v.string(), v.minLength(1)),
    filterCombinator: v.picklist(["no", "and", "or"]),
    filters: v.array(filterConditionSchema),
    existingNote: v.picklist(["skip", "override", "merge", "ask"]),
    otherFolder: v.picklist(["keep", "move", "ask"]),
    otherName: v.picklist(["keep", "rename", "ask"]),
    dryRun: v.boolean(),
  }),
  v.forward(
    v.partialCheck(
      [["datePlace"], ["propertyName"]],
      (input) => input.datePlace !== "property" || input.propertyName.trim().length > 0,
      m.journal_property_name_required(),
    ),
    ["propertyName"],
  ),
);

export const defaultBulkAddParameters = (): BulkAddParameters => ({
  folder: "",
  datePlace: "title",
  propertyName: "",
  dateFormat: "YYYY-MM-DD",
  filterCombinator: "no",
  filters: [],
  existingNote: "skip",
  otherFolder: "keep",
  otherName: "keep",
  dryRun: true,
});
