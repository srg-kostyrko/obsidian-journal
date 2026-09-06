// Mirrors NAME_PREFIX_RE in src/templates/grammar.ts. A name the tokenizer cannot parse is
// not reported as an error — it renders as a literal `{{...}}` in the note filename.
// \p{Nd} (decimal digits), not \p{N}, to mirror JS's own ID_Continue semantics — \p{N} would
// also admit non-identifier characters like ½ or Roman numerals.
export const TEMPLATE_VARIABLE_RE = /^[\p{L}_][\p{L}\p{Nd}_]*$/u;

// Every name NotePathService seeds into a render context that is not a numbering digit.
// A digit that shadows one silently wins or loses depending on seed order.
export const RESERVED_VARIABLE_NAMES: readonly string[] = [
  "date",
  "start_date",
  "end_date",
  "week_of_month",
  "journal_name",
  "note_name",
  "title",
  "relative_date",
  "current_date",
  "time",
  "current_time",
  "notelet_index",
];

// Case-insensitive because TemplateContext.#lookup falls back to a case-insensitive match:
// a variable named `Date` resolves `{{date}}`'s binding and shadows the built-in just as
// surely as `date` would, so a case-sensitive check lets the shadowing through.
export function isReservedVariable(name: string): boolean {
  return RESERVED_VARIABLE_NAMES.includes(name.toLowerCase());
}
