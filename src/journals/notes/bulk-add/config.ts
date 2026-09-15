import * as v from "valibot";

import { filterConditionSchema, type FilterCondition } from "@/decorations/config";
import { m } from "@/i18n";

import { typeIdSchema, type TypeId } from "../../notelets/config";

export type DatePlace = "title" | "property" | "path";
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
  // Present ⇒ every planned note is connected as a notelet of this type rather than as the
  // journal's period note. `existingNote` is then meaningless and ignored: notelets have no
  // anchor to be occupied.
  noteletTypeId?: TypeId;
}

export const bulkAddParametersSchema = v.pipe(
  v.object({
    folder: v.string(),
    datePlace: v.picklist(["title", "property", "path"]),
    propertyName: v.string(),
    dateFormat: v.string(),
    filterCombinator: v.picklist(["no", "and", "or"]),
    filters: v.array(filterConditionSchema),
    existingNote: v.picklist(["skip", "override", "merge", "ask"]),
    otherFolder: v.picklist(["keep", "move", "ask"]),
    otherName: v.picklist(["keep", "rename", "ask"]),
    dryRun: v.boolean(),
    noteletTypeId: v.optional(typeIdSchema),
  }),
  v.forward(
    v.partialCheck(
      [["datePlace"], ["propertyName"]],
      (input) => input.datePlace !== "property" || input.propertyName.trim().length > 0,
      () => m.journal_property_name_required(),
    ),
    ["propertyName"],
  ),
  v.forward(
    v.partialCheck(
      [["datePlace"], ["dateFormat"]],
      (input) => input.datePlace === "path" || input.dateFormat.length > 0,
      () => m.bulk_add_date_format_required(),
    ),
    ["dateFormat"],
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
