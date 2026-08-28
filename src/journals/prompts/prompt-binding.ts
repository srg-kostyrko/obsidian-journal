import { match } from "ts-pattern";

import { CalendarDate } from "@/calendar";
import type { Bindings, VariableSpec } from "@/templates";

import { PROMPT_PLACEHOLDER } from "./placeholder";

import type { Prompt, PromptAnswer } from "./config";

function alternativesFor(prompt: Prompt): readonly string[] {
  return prompt.type === "select"
    ? [PROMPT_PLACEHOLDER, ...prompt.options.map((option) => option.value)]
    : [PROMPT_PLACEHOLDER];
}

function unanswered(prompt: Prompt): VariableSpec {
  return { kind: "string", value: PROMPT_PLACEHOLDER, alternatives: alternativesFor(prompt) };
}

/** How an answer renders into a note name or folder. */
export function renderSpecFor(prompt: Prompt, answer: PromptAnswer | undefined, dateFormat: string): VariableSpec {
  if (answer === undefined) return unanswered(prompt);
  const alternatives = alternativesFor(prompt);
  return match(prompt)
    .with({ type: "date" }, () => {
      const parsed = typeof answer === "string" ? CalendarDate.parse(answer) : undefined;
      if (!parsed || parsed.isErr()) return unanswered(prompt);
      // A real date spec, not a bound string: renderDate applies modifiers before formatting,
      // so the full {{date}} vocabulary — formats, shifts, boundaries — works on the answer.
      return { kind: "date", value: parsed.value, defaultFormat: dateFormat, alternatives } as const;
    })
    .with({ type: "number" }, () =>
      typeof answer === "number" ? ({ kind: "number", value: answer, alternatives } as const) : unanswered(prompt),
    )
    .otherwise(() => ({ kind: "string", value: String(answer), alternatives }) as const);
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
      .otherwise(() => unanswered(prompt))
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
