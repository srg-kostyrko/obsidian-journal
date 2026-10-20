import * as v from "valibot";

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

export type RepairMarker = "climb" | "whole";

/** Never default this field: a failure at or below it is repaired at its parent. */
export function climb<T>(reason: string): v.MetadataAction<T, { repair: "climb"; reason: string }> {
  return v.metadata({ repair: "climb", reason });
}

/** Never drop this list's items one at a time: a failure in any item is repaired at the list's parent. */
export function whole<T>(reason: string): v.MetadataAction<T, { repair: "whole"; reason: string }> {
  return v.metadata({ repair: "whole", reason });
}

export function repairMarkerOf(schema: AnySchema): RepairMarker | undefined {
  const { repair } = v.getMetadata(schema) as { repair?: unknown };
  return repair === "climb" || repair === "whole" ? repair : undefined;
}
