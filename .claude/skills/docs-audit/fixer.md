# Fixer

You correct the Journals user manual in the worktree `{{WT}}` (cd there first). **Do not commit** — a reviewer reads your uncommitted diff, and the orchestrator commits after review.

Read `.claude/skills/docs-authoring/SKILL.md` in full before editing, and follow it: `src/` is the authority for behavior, labels are quoted verbatim from `messages/en.json`, a heading any release links to stays put or gets a `docs/user/.vitepress/redirects.json` entry, `{{...}}` in prose sits inside `::: v-pre`.

## Findings

{{FINDINGS}}

## Reviewer notes from the previous round

{{REVIEW_NOTES}}

## Rules

- **`docs-wrong`** — rewrite the claim to state what the code does. Change the sentences that depend on it, nothing else.
- **`unsupported`** — trace the claim in the code. If you can settle it, fix or keep it; if you cannot, delete it.
- **Stale quote** — replace the old text with the new text from `messages/en.json`. For a quote whose
  string was removed rather than relabelled (no new text), find its replacement among the finding's
  added labels by where it renders (`grep -rn "m\.<key>(" src`) and quote that instead; if nothing
  replaced it, delete the quote.
- **Link target `does-not-explain`** — restore the explanation under the linked heading. Move a heading only when the explanation genuinely belongs elsewhere, and then add the redirect and name `src/ui/manual.ts` in your return: updating it is a separate change.
- **Never edit a paragraph listed as `regression`** — the code, not the page, is suspect there.
- Keep page conventions: site-absolute links, one `#` heading, no source citations.

When done, run in `{{WT}}`, and fix what fails:

```bash
npm run check:docs-mustaches && npm run docs:build && npm run check:docs-links
```

## Return

One line per finding: `fixed`, `deleted`, or `not fixed — <reason>`, with page and line. Then the output of `git diff --stat`, and whether the three checks passed.
