import { formatConjunction, formatDisjunction, m } from "@/i18n";
import { isUnreadable } from "@/settings/repair";

import { blockedByUnreadable } from "../conditions";

import type { StoredVisibilityRule, VisibilityCondition } from "./rule";

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
    // Matches nothing, so under `or` it adds nothing; describeVisibility covers `and`.
    case "unreadable": {
      return undefined;
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

export interface VisibilityWording {
  all: () => string;
  none: () => string;
  matching: (parameters: { conditions: string }) => string;
}

// A condition with nothing to compare is left out of matching (rule.ts), so it is left out
// here too, and Matching with none left reads as what it does: everything.
export function describeVisibility(rule: StoredVisibilityRule | undefined, wording: VisibilityWording): string {
  if (isUnreadable(rule)) return m.tasks_rule_summary_unreadable();
  if (rule === undefined || rule.show === "all") return wording.all();
  if (rule.show === "none" || blockedByUnreadable(rule)) return wording.none();
  const parts = rule.conditions.flatMap((condition) => describeCondition(condition) ?? []);
  if (parts.length === 0) return wording.all();
  const joined = rule.mode === "or" ? formatDisjunction(parts) : formatConjunction(parts);
  return wording.matching({ conditions: joined });
}
