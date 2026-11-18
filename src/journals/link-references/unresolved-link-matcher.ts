import type { AnchorString } from "@/calendar";
import { basenameOf, type VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import type { CycleService } from "../cycle";
import type { NotePathService, PathInverter } from "../notes/note-path";

interface JournalInverters {
  readonly journalName: string;
  readonly path: PathInverter;
  readonly name: PathInverter;
}

/** Decides which journal period, if any, the text of a link to a not-yet-existing note names. */
export class UnresolvedLinkMatcher {
  readonly #paths: NotePathService;
  readonly #cycle: CycleService;
  readonly #inverters: readonly JournalInverters[];

  constructor(paths: NotePathService, cycle: CycleService, journalNames: readonly string[]) {
    this.#paths = paths;
    this.#cycle = cycle;
    this.#inverters = journalNames.flatMap((journalName) => {
      const path = paths.inverterFor(journalName, "path");
      const name = paths.inverterFor(journalName, "name");
      return path.isSome() && name.isSome() ? [{ journalName, path: path.value, name: name.value }] : [];
    });
  }

  #candidate(inverters: JournalInverters, part: "path" | "name", target: VaultPath): AnchorString | undefined {
    const { journalName } = inverters;
    const inverted = inverters[part].invert(target);
    if (inverted.isNone()) return undefined;
    const metadata = inverted.value;
    // A name that carries a question answer is chosen by whoever answered, not by the period.
    if (metadata.answers !== undefined) return undefined;
    if (!this.#cycle.isCanonicalAnchor(journalName, metadata.anchor).getOr(false)) return undefined;
    // Inversion falls back to the period a parsed date falls in without re-rendering it, so a
    // mid-interval day would otherwise name its interval. Only text the journal would write counts.
    const rendered = this.#paths.pathFor(journalName, metadata);
    if (rendered.isErr()) return undefined;
    const written = part === "path" ? rendered.value : `${basenameOf(rendered.value)}.md`;
    return written === target ? metadata.anchor : undefined;
  }

  match(linkText: string): Option<{ journalName: string; anchor: AnchorString }> {
    const part = linkText.includes("/") ? "path" : "name";
    const target = `${linkText}.md` as VaultPath;
    const matches: { journalName: string; anchor: AnchorString }[] = [];
    for (const inverters of this.#inverters) {
      const anchor = this.#candidate(inverters, part, target);
      if (anchor !== undefined) matches.push({ journalName: inverters.journalName, anchor });
    }
    const [only, ...rest] = matches;
    return only !== undefined && rest.length === 0 ? Option.some(only) : Option.none();
  }
}
