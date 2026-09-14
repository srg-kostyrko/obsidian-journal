# Claim reviewer

You did not write the edits in the worktree `{{WT}}` (cd there first). Check them. You are read-only: edit, commit and push nothing.

Run `git diff` — the edits are uncommitted, against `{{BASE}}`.

## What to do

1. For **every sentence the diff adds or changes that states behavior**, settle it in the code in `{{WT}}/src` and the UI text in `messages/en.json`:
   - `confirmed` — the code does what the sentence says; give `file:line`.
   - `wrong` — it does not; say what it does.
   - `unsupported` — you cannot trace it; say what you looked at.
2. Flag any **changed paragraph no finding asked for** that is not a direct dependent of one, as `wrong` with note "out of scope".
3. Quoted labels must match `messages/en.json` exactly.

## Return

Only this, in one `json` fence:

```json
{
  "claims": [
    {
      "page": "docs/user/notes.md",
      "line": 70,
      "quote": "<the new sentence, verbatim>",
      "verdict": "confirmed",
      "evidence": ["src/journals/startup/startup-open.ts:68"],
      "note": ""
    }
  ]
}
```
