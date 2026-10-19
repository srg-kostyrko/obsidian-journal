import { formatConjunction, formatDisjunction, m } from "@/i18n";

import type { NoteVisibility, VisibilityCondition } from "../visibility";

// Each list matches on any of its entries, so it reads as "or" whatever the rule's mode.
function describeCondition(condition: VisibilityCondition): string | undefined {
  switch (condition.type) {
    case "tag": {
      return condition.tags.length === 0
        ? undefined
        : m.tasks_note_visibility_condition_tag({ tags: formatDisjunction(condition.tags) });
    }
    case "folder": {
      return condition.folders.length === 0
        ? undefined
        : m.tasks_note_visibility_condition_folder({ folders: formatDisjunction(condition.folders) });
    }
    case "property": {
      return condition.values.length === 0
        ? undefined
        : m.tasks_note_visibility_condition_property({
            property: condition.name,
            values: formatDisjunction(condition.values),
          });
    }
  }
}

// A condition with nothing to compare is left out of matching (visibility.ts), so it is left out
// here too, and Matching with none left reads as what it does: every task note.
export function describeVisibility(rule: NoteVisibility | undefined): string {
  if (rule === undefined || rule.show === "all") return m.tasks_note_visibility_summary_all();
  if (rule.show === "none") return m.tasks_note_visibility_summary_none();
  const parts = rule.conditions.flatMap((condition) => describeCondition(condition) ?? []);
  if (parts.length === 0) return m.tasks_note_visibility_summary_all();
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return m.tasks_note_visibility_summary_matching({ conditions: joined });
}
