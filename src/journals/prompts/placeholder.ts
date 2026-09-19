// Stands in for an answer that has not been given, in the note name and the folder only —
// the body and frontmatter render an unanswered prompt as empty instead.
//
// Three constraints, and every candidate that fails one fails silently. It must pass
// `hasUnsafePathCharacters`, the check a typed answer in the path gets, since it sits in the same
// place; it must not be markdown formatting even when two placeholders end up adjacent in one
// name (which rules out `~ask~`, `__ask__` and `%ask%`); and it must not collide with `{{ }}`.
// Re-check all three before changing it.
export const PROMPT_PLACEHOLDER = "(unanswered)";

export function isPlaceholder(value: unknown): boolean {
  return value === PROMPT_PLACEHOLDER;
}
