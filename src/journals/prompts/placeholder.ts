// Stands in for an answer that has not been given, in the note name and the folder only —
// the body and frontmatter render an unanswered prompt as empty instead.
//
// Four constraints, and every candidate that fails one fails silently. It must avoid the
// characters Obsidian forbids in a file name (`*"\/<>:|?` on Windows) and in a link
// (`#^[]|`), both read out of app.js in the 1.8.7 asar; it must not be markdown formatting
// even when two placeholders end up adjacent in one name (which rules out `~ask~`, `__ask__`
// and `%ask%`); and it must not collide with `{{ }}`. Re-check all four before changing it.
export const PROMPT_PLACEHOLDER = "(unanswered)";

export function isPlaceholder(value: unknown): boolean {
  return value === PROMPT_PLACEHOLDER;
}
