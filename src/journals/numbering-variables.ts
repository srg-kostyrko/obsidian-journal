// Mirrors NAME_PREFIX_RE in src/templates/grammar.ts. A name the tokenizer cannot parse is
// not reported as an error — it renders as a literal `{{...}}` in the note filename.
// \p{Nd} (decimal digits), not \p{N}, to mirror JS's own ID_Continue semantics — \p{N} would
// also admit non-identifier characters like ½ or Roman numerals.
export const NUMBERING_VARIABLE_RE = /^[\p{L}_][\p{L}\p{Nd}_]*$/u;

// Every name NotePathService seeds into a render context that is not a numbering digit.
// A digit that shadows one silently wins or loses depending on seed order.
export const RESERVED_VARIABLE_NAMES: readonly string[] = [
  "date",
  "start_date",
  "end_date",
  "journal_name",
  "note_name",
  "title",
  "relative_date",
  "current_date",
  "time",
  "current_time",
];
