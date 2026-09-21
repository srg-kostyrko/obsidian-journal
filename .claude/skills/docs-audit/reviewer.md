# Claim reviewer

You did not write the edits in `{{WORK}}` (cd there first) — a worktree, or the audited checkout itself when the audit runs in place. Check them. You are read-only: edit, commit and push nothing.

Run `git diff` — the edits are uncommitted, against `{{BEFORE}}`. Also list new files with `git ls-files --others --exclude-standard -- docs/user`, read each in full, and treat every sentence in them as added; you are read-only, so do not `git add` them.

## Findings the edits address

{{FINDINGS}}

## What to do

1. For **every sentence the diff adds or changes that states behavior**, settle it in the code in `{{ROOT}}/src` and the UI text in `{{ROOT}}/messages/en.json`:
   - `confirmed` — the code does what the sentence says; give `file:line`.
   - `wrong` — it does not; say what it does.
   - `unsupported` — you cannot trace it; say what you looked at.
2. Flag any **changed paragraph no finding above asked for** that is not a direct dependent of one, as `wrong` with note "out of scope".
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
