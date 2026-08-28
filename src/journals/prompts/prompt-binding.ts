import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import type { Bindings, VariableSpec } from "@/templates";

import { PROMPT_PLACEHOLDER } from "./placeholder";

import type { Prompt, PromptAnswer } from "./config";

export interface PromptRender {
  readonly spec: VariableSpec;
  readonly answered: boolean;
}

function alternativesFor(prompt: Prompt): readonly string[] {
  return prompt.type === "select"
    ? [PROMPT_PLACEHOLDER, ...prompt.options.map((option) => option.value)]
    : [PROMPT_PLACEHOLDER];
}

function unanswered(prompt: Prompt): PromptRender {
  return {
    spec: { kind: "string", value: PROMPT_PLACEHOLDER, alternatives: alternativesFor(prompt) },
    answered: false,
  };
}

/**
 * A prompt's binding, and whether the answer behind it was usable.
 *
 * `answered: false` means `spec` is the placeholder stand-in — the answer was missing, or it
 * was present but unusable (a date that does not parse, a number that is not one). The note
 * name wants the placeholder either way; the body wants an empty string for both. They stay
 * one decision here because two spellings of "is this answered" drift apart silently.
 */
export function renderBindingFor(prompt: Prompt, answer: PromptAnswer | undefined, dateFormat: string): PromptRender {
  if (answer === undefined) return unanswered(prompt);
  const alternatives = alternativesFor(prompt);
  return (
    match(prompt)
      .with({ type: "date" }, () => {
        const parsed = typeof answer === "string" ? CalendarDate.parse(answer) : undefined;
        if (!parsed || parsed.isErr()) return unanswered(prompt);
        // A real date spec, not a bound string: renderDate applies modifiers before formatting,
        // so the full {{date}} vocabulary — formats, shifts, boundaries — works on the answer.
        return {
          spec: { kind: "date", value: parsed.value, defaultFormat: dateFormat, alternatives } as const,
          answered: true,
        };
      })
      .with({ type: "number" }, () =>
        typeof answer === "number"
          ? ({ spec: { kind: "number", value: answer, alternatives }, answered: true } as const)
          : unanswered(prompt),
      )
      // A yes/no answer is a fact with two states, and `String(true)` puts a programmer's word
      // into the user's prose. Both states stay visible, in the reader's own language.
      .with({ type: "toggle" }, () =>
        typeof answer === "boolean"
          ? ({
              spec: { kind: "string", value: answer ? m.common_yes() : m.common_no(), alternatives },
              answered: true,
            } as const)
          : unanswered(prompt),
      )
      .otherwise(() => ({ spec: { kind: "string", value: String(answer), alternatives }, answered: true }) as const)
  );
}

/**
 * How a slot matches when inverting a path. The seeded value is unused — only the kind and the
 * alternatives drive the compiled pattern, exactly as `#parseContext` already seeds numbering.
 */
export function parseSpecFor(prompt: Prompt, dateFormat: string): VariableSpec {
  const alternatives = alternativesFor(prompt);
  return (
    match(prompt)
      .with(
        { type: "date" },
        () => ({ kind: "date", value: CalendarDate.today(), defaultFormat: dateFormat, alternatives }) as const,
      )
      .with({ type: "number" }, () => ({ kind: "number", value: 0, alternatives }) as const)
      // Free text has no bounded pattern, so it matches only the placeholder: an answered text
      // name does not invert, and nothing may be captured in its place.
      .otherwise(() => unanswered(prompt).spec)
  );
}

export function answersFromBindings(prompts: readonly Prompt[], bindings: Bindings): Record<string, PromptAnswer> {
  const answers: Record<string, PromptAnswer> = {};
  for (const prompt of prompts) {
    const bound = bindings.get(prompt.variable);
    if (bound === undefined) continue;
    const answer = match(bound)
      .with({ kind: "string" }, (value) => (value.value === PROMPT_PLACEHOLDER ? undefined : value.value))
      .with({ kind: "number" }, (value) => value.value)
      .with({ kind: "date" }, (value) => value.value.toAnchor())
      .exhaustive();
    if (answer === undefined) continue;
    answers[prompt.variable] = answer;
  }
  return answers;
}
