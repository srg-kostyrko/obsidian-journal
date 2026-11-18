import type { AnchorString } from "@/calendar";
import { basenameOf, type VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { invertibilityOf, type InvertibilityServices } from "../notes/invertibility";
import { promptsInPath } from "../prompts/prompts-in-path";

import type { PathInverter } from "../notes/note-path";

type Part = "path" | "name";

interface JournalInverters {
  readonly journalName: string;
  readonly path: PathInverter | undefined;
  readonly name: PathInverter | undefined;
}

/** Decides which journal period, if any, the text of a link to a not-yet-existing note names. */
export class UnresolvedLinkMatcher {
  readonly #services: InvertibilityServices;
  readonly #inverters: readonly JournalInverters[];

  constructor(services: InvertibilityServices, journalNames: readonly string[]) {
    this.#services = services;
    const { paths } = services;
    this.#inverters = journalNames.flatMap((journalName) => {
      const config = paths.configFor(journalName);
      if (!config) return [];
      // A link names a period only through a naming that reads back on its own and that the period
      // alone decides. A question's answer, or its "(unanswered)" placeholder, is chosen by whoever
      // answered, so any prompt variable in that part rules the part out.
      const usable = (part: Part): PathInverter | undefined => {
        const owner = part === "path" ? config : { ...config, folder: "" };
        const decidedByPeriod = promptsInPath(owner).length === 0 && invertibilityOf(config, services, part) === null;
        return decidedByPeriod ? paths.inverterFor(journalName, part).getOrUndefined() : undefined;
      };
      return [{ journalName, path: usable("path"), name: usable("name") }];
    });
  }

  #candidate(inverters: JournalInverters, part: Part, target: VaultPath): AnchorString | undefined {
    const { journalName } = inverters;
    const inverter = inverters[part];
    if (inverter === undefined) return undefined;
    const inverted = inverter.invert(target);
    if (inverted.isNone()) return undefined;
    const metadata = inverted.value;
    // Inversion falls back to the period a parsed date falls in without re-rendering it, so a
    // mid-interval day would otherwise name its interval. Only text the journal would write counts.
    const rendered = this.#services.paths.pathFor(journalName, metadata);
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
