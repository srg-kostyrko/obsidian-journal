// Run through tsx (`npm run gen:appearance-gate`): it imports the TypeScript catalog directly.
import { writeFileSync } from "node:fs";

import { gateSnippet } from "../src/notes-calendar/appearance/gate-snippet.ts";

// src/notes-calendar/appearance/gate-snippet.test.ts reads this same path.
const snippet = new URL(
  "../e2e-tests/fixtures/e2e-appearance-snippets/.obsidian/snippets/journal-gate.css",
  import.meta.url,
);

writeFileSync(snippet, gateSnippet());
