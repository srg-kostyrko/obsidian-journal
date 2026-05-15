import { match } from "ts-pattern";

import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection } from "./config";
import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";

import type { JournalConfig, NumberingSource } from "./config";

export class NumberingService {
  readonly #settings = inject(SettingsService);
  readonly #cycle = inject(CycleService);
  readonly #index = inject(JournalsIndex);

  assignNumbers(name: string, anchor: AnchorString): Option<Readonly<Record<string, number>>> {
    const config = this.#settings.getCollection(journalConfigCollection).get(name) as JournalConfig | undefined;
    if (!config) return Option.none();
    const numbering = config.numbering;
    if (!numbering.enabled) return Option.none();
    if (!numbering.allowBefore && anchor < numbering.anchorDate) return Option.none();

    const previousPath = this.#index.findPrevious(name, anchor);
    const basis = previousPath
      .flatMap((path) => this.#index.entryByPath(path))
      .flatMap((entry) => Option.fromNullable(entry.numbers).map((numbers) => ({ anchor: entry.anchor, numbers })));

    if (basis.isSome()) {
      const stepsFromBasisOpt = this.#cycle.countRepeats(name, basis.value.anchor, anchor);
      if (stepsFromBasisOpt.isSome()) {
        return Option.some(this.#cascadeFromBasis(numbering.sources, basis.value.numbers, stepsFromBasisOpt.value));
      }
    }

    const stepsOpt = this.#cycle.countRepeats(name, numbering.anchorDate, anchor);
    if (stepsOpt.isNone()) return Option.none();

    return Option.some(this.#cascade(numbering.sources, stepsOpt.value));
  }

  #cascade(sources: readonly NumberingSource[], stepsInnermost: number): Readonly<Record<string, number>> {
    const result: Record<string, number> = {};
    let innerSteps = stepsInnermost;
    for (let i = sources.length - 1; i >= 0; i--) {
      const source = sources[i];
      const steps = i === sources.length - 1 ? stepsInnermost : innerSteps;
      const raw = source.anchorValue + steps;
      const value = match(source.reset)
        .with({ kind: "never" }, () => raw)
        .with(
          { kind: "after" },
          ({ count }) => ((((raw - source.anchorValue) % count) + count) % count) + source.anchorValue,
        )
        .exhaustive();
      result[source.variable] = value;
      innerSteps = match(source.reset)
        .with({ kind: "after" }, ({ count }) => Math.floor(steps / count))
        .with({ kind: "never" }, () => 0)
        .exhaustive();
    }
    return result;
  }

  #cascadeFromBasis(
    sources: readonly NumberingSource[],
    basis: Readonly<Record<string, number>>,
    stepsFromBasis: number,
  ): Readonly<Record<string, number>> {
    const result: Record<string, number> = {};
    let innerSteps = stepsFromBasis;
    for (let i = sources.length - 1; i >= 0; i--) {
      const source = sources[i];
      const steps = i === sources.length - 1 ? stepsFromBasis : innerSteps;
      const basisValue = basis[source.variable] ?? source.anchorValue;
      const raw = basisValue + steps;
      const value = match(source.reset)
        .with({ kind: "never" }, () => raw)
        .with(
          { kind: "after" },
          ({ count }) => ((((raw - source.anchorValue) % count) + count) % count) + source.anchorValue,
        )
        .exhaustive();
      result[source.variable] = value;
      innerSteps = match(source.reset)
        .with({ kind: "after" }, ({ count }) => Math.floor(steps / count))
        .with({ kind: "never" }, () => 0)
        .exhaustive();
    }
    return result;
  }
}
