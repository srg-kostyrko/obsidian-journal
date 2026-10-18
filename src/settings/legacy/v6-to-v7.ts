import type { Migration } from "@/settings";

function tasksCondition(quantifier: "any" | "all", status: "open" | "done"): Record<string, unknown> {
  return { type: "tasks", quantifier, status, source: "both", filter: { mode: "and", conditions: [] } };
}

function rewrite(condition: unknown): unknown {
  if (!condition || typeof condition !== "object") return condition;
  switch ((condition as { type?: unknown }).type) {
    case "has-open-task": {
      return tasksCondition("any", "open");
    }
    case "all-tasks-completed": {
      return tasksCondition("all", "done");
    }
    default: {
      return condition;
    }
  }
}

export const v6ToV7Migration: Migration = {
  fromVersion: 6,
  toVersion: 7,
  migrate(raw) {
    const journals = (raw.journals ?? {}) as Record<string, Record<string, unknown>>;
    for (const journal of Object.values(journals)) {
      if (!journal || typeof journal !== "object" || !Array.isArray(journal.decorations)) continue;
      for (const decoration of journal.decorations as unknown[]) {
        if (!decoration || typeof decoration !== "object") continue;
        const entry = decoration as { conditions?: unknown };
        if (Array.isArray(entry.conditions)) entry.conditions = entry.conditions.map(rewrite);
      }
    }
    return raw;
  },
};
