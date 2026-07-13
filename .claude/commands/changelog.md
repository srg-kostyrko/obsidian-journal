---
description: Draft user-facing release notes into CHANGELOG.md [Unreleased]
argument-hint: [version]
allowed-tools: Bash(git log:*), Bash(git describe:*), Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh api:*), Bash(git diff:*), Read, Edit
---

Draft user-facing release notes into the `## [Unreleased]` section of `CHANGELOG.md`.
Produce a **draft only** — never commit, bump the version, or tag.

## Inputs

- Target version: `$1`. If empty, run
  `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` and:
  - exactly one open milestone → use it;
  - zero or multiple → ask the user which version before continuing.
- Last release tag: `git describe --tags --abbrev=0` (tags are unprefixed, e.g. `2.1.10`).

## Gather

1. Commits in range (subjects + bodies, oldest first):
   `git log <lastTag>..HEAD --no-merges --reverse --pretty=format:'%x1e%H%x1f%s%x1f%b'`
   (records separated by 0x1e, fields by 0x1f).
2. Milestone-closed issues:
   `gh issue list --milestone "<version>" --state closed --json number,title --jq '.[] | "\(.number)\t\(.title)"'`
3. Commit-referenced fixed issues: scan every commit subject+body for
   `(?i)(fix|close|resolve)(e[sd])?\s+#(\d+)`; collect the numbers; for each,
   `gh issue view <n> --json number,title,state --jq '"\(.number)\t\(.title)\t\(.state)"'`.

## Build the draft

**Features** — from commits whose subject type is `feat` (ignore
`refactor|test|style|chore|build|ci|docs`):

- List **every distinct user-facing feature**. Group the multiple commits that
  implement one capability into a single bullet.
- Phrase for end users, sentence case, imperative-free (describe the capability,
  not the commit). No scopes, no commit hashes.

**Bug Fixes** — union of milestone issues and referenced issues, **deduped by issue
number**:

- One bullet per issue, using the issue title cleaned of tracker prefixes
  (`Bug:`, `FR:`, `[bug]`, etc.).
- `fix` commits that reference no issue → summarize into their own user-facing
  bullets so nothing is dropped.

Omit a section entirely if it has no entries.

## Write

- Read `CHANGELOG.md`. If a `## [Unreleased]` section exists, replace its body with
  the new draft; otherwise insert a fresh `## [Unreleased]` section immediately after
  the header block (before the first versioned `## [x.y.z]`).
- Use `Edit` to apply the change.

## Report

- Run `git diff CHANGELOG.md` and show it.
- State clearly that this is an unreviewed draft and list any judgement calls
  (features grouped, fix commits with no issue, milestone vs ref-only sources).
- Do **not** commit, bump the version, or tag. Stop and let the user edit.
