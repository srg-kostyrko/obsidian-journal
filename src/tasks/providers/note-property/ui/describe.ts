import { m } from "@/i18n";

import type { NotePropertySliceState } from "../slice";

export function describeIdentification(identify: NotePropertySliceState["identify"]): string {
  if (identify.by === "tag") return m.tasks_note_property_summary_tag({ tag: identify.tag });
  if (identify.value === "") return m.tasks_note_property_summary_property_any({ property: identify.name });
  return m.tasks_note_property_summary_property({ property: identify.name, value: identify.value });
}
