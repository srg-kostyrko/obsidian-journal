import { match, P } from "ts-pattern";

import type { VaultPath } from "@/infrastructure/host";
import type { Option } from "@/infrastructure/result";
import type { JournalConfig, JournalEntry, NavBlockRow } from "@/journals";

export type LinkTarget =
  | { readonly kind: "none" }
  | { readonly kind: "self"; readonly path: VaultPath }
  | { readonly kind: "open"; readonly journalNames: readonly string[] };

export function resolveLinkTarget(
  row: NavBlockRow,
  _noteJournal: JournalConfig,
  shelfJournals: readonly JournalConfig[],
  noteEntry: Option<JournalEntry>,
): LinkTarget {
  return match(row.link)
    .with("none", () => ({ kind: "none" }) as const)
    .with("self", () =>
      noteEntry.isSome() ? ({ kind: "self", path: noteEntry.value.path } as const) : ({ kind: "none" } as const),
    )
    .with("journal", () =>
      row.journal.length > 0
        ? ({ kind: "open", journalNames: [row.journal] as const } as const)
        : ({ kind: "none" } as const),
    )
    .with(P.union("day", "week", "month", "quarter", "year"), (kind) => {
      const matches = shelfJournals.filter((journal) => journal.write.type === kind).map((journal) => journal.name);
      return matches.length > 0 ? ({ kind: "open", journalNames: matches } as const) : ({ kind: "none" } as const);
    })
    .exhaustive();
}
