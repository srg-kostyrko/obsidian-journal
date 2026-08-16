import { inject } from "@/infrastructure/di";
import { JournalsEventsToken, JournalsRepository, type JournalsEvents, type NavBlockSegment } from "@/journals";

import type { Emitter } from "nanoevents";

type BlockField = "navBlock" | "intervalBlock";
const FIELDS: readonly BlockField[] = ["navBlock", "intervalBlock"];

export class NavReferenceIntegrity {
  readonly #journals: JournalsRepository;

  constructor(
    journals: JournalsRepository = inject(JournalsRepository),
    events: Emitter<JournalsEvents> = inject(JournalsEventsToken),
  ) {
    this.#journals = journals;
    events.on("renamed", (oldName, newName) => {
      this.#rewrite((segment) => (segment.journal === oldName ? { ...segment, journal: newName } : segment));
    });
    events.on("deleted", (name) => {
      this.#rewrite((segment) =>
        segment.journal === name ? { ...segment, link: "none" as const, journal: "" } : segment,
      );
    });
  }

  #rewrite(map: (segment: NavBlockSegment) => NavBlockSegment): void {
    for (const journal of this.#journals.find().list()) {
      for (const field of FIELDS) {
        const lines = journal[field].lines;
        let changed = false;
        const next = lines.map((line) =>
          line.map((segment) => {
            const mapped = map(segment);
            if (mapped !== segment) changed = true;
            return mapped;
          }),
        );
        if (!changed) continue;
        // An explicit branch, not a computed key: the repository's update takes a typed
        // partial, and `{ [field]: … }` widens to `string` and fails the typecheck. This is
        // the shape `edit-nav-row.flow.ts` uses for the same reason.
        const block = { ...journal[field], lines: next };
        this.#journals.update(journal.name, field === "navBlock" ? { navBlock: block } : { intervalBlock: block });
      }
    }
  }
}
