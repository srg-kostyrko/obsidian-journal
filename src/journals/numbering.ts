import { match } from "ts-pattern";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { JournalsRepository } from "./repository";

import type { JournalConfig, JournalNumberingConfig, NumberingSource } from "./config";

// Only a single, never-resetting source is reversible: its value increases monotonically
// with the cycle count, so subtracting anchorValue recovers the step offset. Cyclic (reset
// "after") sources wrap modulo a count and multiple sources can't be disentangled from one
// captured number, so neither can be inverted back to a unique anchor.
export function invertibleNumberingVariable(numbering: JournalNumberingConfig): string | null {
  if (!numbering.enabled) return null;
  if (numbering.sources.length !== 1) return null;
  const [source] = numbering.sources;
  if (source.reset.kind !== "never") return null;
  return source.variable;
}

export class NumberingService {
  readonly #journals = inject(JournalsRepository);
  readonly #cycle = inject(CycleService);
  readonly #index = inject(JournalsIndex);

  readonly #cache = new Map<
    string,
    { fp: string; values: Map<AnchorString, Readonly<Record<string, number>> | null> }
  >();

  constructor() {
    this.#index.events.on("journalDirty", ({ journalName }) => {
      this.#cache.delete(journalName);
    });
  }

  #compute(
    name: string,
    anchor: AnchorString,
    numbering: JournalNumberingConfig,
    anchorDate: AnchorString,
  ): Option<Readonly<Record<string, number>>> {
    if (!numbering.enabled) return Option.none();
    if (!numbering.allowBefore && anchor < anchorDate) return Option.none();

    // Derive from the nearest previous existing note, else back-compute from the
    // nearest next existing note, else fall to the config anchor. A manually renumbered note
    // thus pins the sequence in both directions — countRepeats is signed, so a next-note basis
    // subtracts the steps between them.
    const fromPrevious = this.#basisNumbers(this.#index.findPrevious(name, anchor), name, anchor, numbering.sources);
    if (fromPrevious.isSome()) return fromPrevious;

    const fromNext = this.#basisNumbers(this.#index.findNext(name, anchor), name, anchor, numbering.sources);
    if (fromNext.isSome()) return fromNext;

    const stepsOpt = this.#cycle.countRepeats(name, anchorDate, anchor);
    if (stepsOpt.isNone()) return Option.none();

    return Option.some(this.#cascade(numbering.sources, undefined, stepsOpt.value));
  }

  #basisNumbers(
    pathOpt: Option<VaultPath>,
    name: string,
    anchor: AnchorString,
    sources: readonly NumberingSource[],
  ): Option<Readonly<Record<string, number>>> {
    const basis = pathOpt
      .flatMap((path) => this.#index.entryByPath(path))
      .flatMap((entry) => Option.fromNullable(entry.numbers).map((numbers) => ({ anchor: entry.anchor, numbers })));
    if (basis.isNone()) return Option.none();
    return this.#cycle
      .countRepeats(name, basis.value.anchor, anchor)
      .map((steps) => this.#cascade(sources, basis.value.numbers, steps));
  }

  #cascade(
    sources: readonly NumberingSource[],
    basis: Readonly<Record<string, number>> | undefined,
    steps: number,
  ): Readonly<Record<string, number>> {
    const result: Record<string, number> = {};
    let innerResetsCrossed = steps;
    for (let i = sources.length - 1; i >= 0; i--) {
      const source = sources[i];
      const sourceSteps = i === sources.length - 1 ? steps : innerResetsCrossed;
      const basisValue = basis?.[source.variable] ?? source.anchorValue;
      const raw = basisValue + sourceSteps;
      const value = match(source.reset)
        .with({ kind: "never" }, () => raw)
        .with(
          { kind: "after" },
          ({ count }) => ((((raw - source.anchorValue) % count) + count) % count) + source.anchorValue,
        )
        .exhaustive();
      result[source.variable] = value;
      innerResetsCrossed = match(source.reset)
        .with({ kind: "after" }, ({ count }) => {
          const basisPosition = basisValue - source.anchorValue;
          return Math.floor((basisPosition + sourceSteps) / count) - Math.floor(basisPosition / count);
        })
        .with({ kind: "never" }, () => 0)
        .exhaustive();
    }
    return result;
  }

  // A defined start date IS the numbering anchor — the settings UI hides the anchor
  // picker and labels the start as the anchor, so fall back to the explicit picker only when no
  // start date is set.
  #anchorDateFor(config: JournalConfig): AnchorString {
    return config.timeline.start || config.numbering.anchorDate;
  }

  assignNumbers(name: string, anchor: AnchorString): Option<Readonly<Record<string, number>>> {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return Option.none();
    const config = configOpt.value;
    const numbering = config.numbering;
    const anchorDate = this.#anchorDateFor(config);
    const fp = `${JSON.stringify(numbering)}|start=${anchorDate}`;

    let bucket = this.#cache.get(name);
    if (bucket && bucket.fp !== fp) {
      this.#cache.delete(name);
      bucket = undefined;
    }
    if (!bucket) {
      bucket = { fp, values: new Map() };
      this.#cache.set(name, bucket);
    }
    const cached = bucket.values.get(anchor);
    if (cached !== undefined) {
      return cached === null ? Option.none() : Option.some(cached);
    }

    const result = this.#compute(name, anchor, numbering, anchorDate);
    bucket.values.set(anchor, result.isSome() ? result.value : null);
    return result;
  }

  anchorForNumbers(name: string, numbers: Readonly<Record<string, number>>): Option<AnchorString> {
    const configOpt = this.#journals.get(name);
    if (configOpt.isNone()) return Option.none();
    const config = configOpt.value;
    const numbering = config.numbering;
    const anchorDate = this.#anchorDateFor(config);
    const variable = invertibleNumberingVariable(numbering);
    if (variable === null || !anchorDate) return Option.none();
    const value = numbers[variable];
    if (value === undefined) return Option.none();
    const [source] = numbering.sources;
    const steps = value - source.anchorValue;
    if (steps < 0 && !numbering.allowBefore) return Option.none();
    return this.#cycle.anchorAtOffset(name, anchorDate, steps);
  }
}
