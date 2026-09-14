# Link auditor

The plugin's settings link into the manual through `src/ui/manual.ts`. You check that every linked section the release changed still explains the settings section that links to it. You are read-only: edit, commit and push nothing. Whether a link _resolves_ is already checked by `npm run check:docs-links`; do not repeat that.

Work in `{{ROOT}}` (cd there first).

## The manual diff for the release range

The diff is in the file `{{DOCS_DIFF}}` — it may run to thousands of lines. Read it per page rather
than whole: `git diff {{PREV}} {{UPPER}} -- docs/user/<page>.md | grep '^@@'` gives that page's hunk
headers.

## Call sites

The list is in the file `{{CALL_SITES}}`.

## What to do

1. **Work out which targets the diff touched.** Read `src/ui/manual.ts`. A value `"/page"` is a page target, touched by any hunk in `docs/user/page.md`. A value `"/page#id"` is a section target: find its heading (`grep -n '{#id}' docs/user/page.md`, or the heading whose slug is `id`), and it is touched when a hunk's added or removed lines fall between that heading and the next heading of the same or higher level. Use the `+start,count` side of each hunk header for line numbers.
2. **For each touched target**, read the settings section at each call site — its heading comes from the `m.*()` message the component renders, and its rows from the component — and read the target section as it stands now.
3. **Decide**: `explains` if the section tells a reader what that settings section configures; `does-not-explain` otherwise. A section that explains most of it and has lost one row's explanation is `does-not-explain`; say which row in `note`.

## Return

Only this, in one `json` fence. For a `does-not-explain` target, `note` names its cause plainly — a
stale label, a rewritten sentence, a missing row — rather than describing the symptom; the orchestrator
merges it with a matching finding from another auditor by that name:

```json
{
  "targets": [
    {
      "key": "manual.journal.timeline",
      "path": "/journals#timeline",
      "callSites": ["src/journals/settings/ui/sections/TimelineSection.vue:66"],
      "verdict": "explains",
      "note": ""
    },
    {
      "key": "manual.journal.autoCreate",
      "path": "/journals#automatic-note-creation",
      "callSites": ["src/journals/settings/ui/sections/AutoCreateSection.vue:40"],
      "verdict": "does-not-explain",
      "note": "the Devices row is gone; the label it explained is now \"Automatic note creation\""
    }
  ]
}
```

List only touched targets. An empty diff returns `{ "targets": [] }`.
