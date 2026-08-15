// Mirrors NAME_PREFIX_RE in src/templates/grammar.ts. A name the tokenizer cannot parse is
// not reported as an error — it renders as a literal `{{...}}` in the note filename.
export const NUMBERING_VARIABLE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

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
