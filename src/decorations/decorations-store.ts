import { match } from "ts-pattern";

import { inject } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals/repository";
import { SettingsService } from "@/settings";
import { ShelvesRepository } from "@/shelves/repository";

import { decorationsSlice } from "./settings/slice";

import type { CalendarDecoration, JournalDecoration } from "./config";
import type { CalendarDecorationOwner, DecorationOwner } from "./owner";

export class DecorationsStore {
  readonly #journals = inject(JournalsRepository);
  readonly #shelves = inject(ShelvesRepository);
  readonly #slice = inject(SettingsService).getSlice(decorationsSlice);

  calendarList(owner: CalendarDecorationOwner): readonly CalendarDecoration[] {
    return match(owner)
      .with({ kind: "shelf" }, ({ shelfName }) =>
        this.#shelves.get(shelfName).match<readonly CalendarDecoration[]>({
          // A shelf saved before calendar decorations existed parses via the schema's
          // default, but a shelf constructed directly (tests, pre-migration storage)
          // may still lack the field at runtime.
          some: (shelf) => shelf.decorations ?? [],
          none: () => [],
        }),
      )
      .with({ kind: "global" }, () => this.#slice.state.decorations)
      .exhaustive();
  }

  // The editor works on the wider journal shape; a calendar owner's list is a subset of it,
  // so widening here is safe and keeps one section and one flow serving every owner.
  list(owner: DecorationOwner): readonly JournalDecoration[] {
    return match(owner)
      .with({ kind: "journal" }, ({ journalName }) =>
        this.#journals.get(journalName).match<readonly JournalDecoration[]>({
          some: (config) => config.decorations,
          none: () => [],
        }),
      )
      .otherwise((calendarOwner) => this.calendarList(calendarOwner));
  }

  exists(owner: DecorationOwner): boolean {
    return match(owner)
      .with({ kind: "journal" }, ({ journalName }) => this.#journals.get(journalName).isSome())
      .with({ kind: "shelf" }, ({ shelfName }) => this.#shelves.get(shelfName).isSome())
      .with({ kind: "global" }, () => true)
      .exhaustive();
  }

  save(owner: DecorationOwner, next: readonly JournalDecoration[]): void {
    match(owner)
      .with({ kind: "journal" }, ({ journalName }) => {
        this.#journals.update(journalName, { decorations: [...next] });
      })
      .with({ kind: "shelf" }, ({ shelfName }) => {
        this.#shelves.update(shelfName, { decorations: next as CalendarDecoration[] });
      })
      .with({ kind: "global" }, () => {
        this.#slice.state = { decorations: next as CalendarDecoration[] };
      })
      .exhaustive();
  }
}
