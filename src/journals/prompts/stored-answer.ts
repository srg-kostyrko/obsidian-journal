import type { Prompt, PromptAnswer } from "./config";

function isLink(value: unknown): value is string {
  return typeof value === "string" && value.length > 4 && value.startsWith("[[") && value.endsWith("]]");
}

/** The answer a stored property value holds for this question, if it holds one. */
export function readStoredAnswer(prompt: Prompt, value: unknown): PromptAnswer | undefined {
  if (prompt.type === "note") {
    // A hand-edited list of several links is not one answer. Reading its first item would have
    // the write mutator, which runs on every open, collapse the list to that one link.
    const item = Array.isArray(value) ? (value.length === 1 ? (value as unknown[])[0] : undefined) : value;
    return isLink(item) ? item : undefined;
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

/**
 * What an answer is written to its property as.
 *
 * A note link is a one-item list so the property is typed as a list from the first note, and a
 * question that later accepts several notes writes to it without a type change.
 */
export function storedValueOf(prompt: Prompt, answer: PromptAnswer): unknown {
  return prompt.type === "note" ? [answer] : answer;
}
