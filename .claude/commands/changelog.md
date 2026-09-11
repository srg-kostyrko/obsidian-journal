---
description: Add this branch's CHANGELOG entry, or audit [Unreleased] for gaps
argument-hint: [audit]
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(git describe:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh pr view:*), Bash(gh api:*), Bash(npx prettier:*), Read, Edit
---

Changelog entries are written **per pull request**, into the `## [Unreleased]`
section of `CHANGELOG.md`, as part of the change that earns them. This command
serves that workflow in two modes.

**Never rewrite or replace an existing bullet.** Entries carry the voice of the
person who made the change. This command only ever **appends**.

## Mode: entry (default, no argument)

Write the entry for the work on the current branch.

### Gather

```bash
BASE=$(git merge-base main HEAD)
git log "$BASE"..HEAD --no-merges --reverse --pretty=format:'%s%n%b%n---'
git diff --stat "$BASE"..HEAD
```

Read the diff itself for anything the commit subjects do not explain. If the
branch has a pull request, `gh pr view --json title,body` carries the framing
the author already chose — prefer their words.

Find the issue: a closing keyword in any commit subject or body —
`(?i)(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#(\d+)` — or the PR body. If there
is one, `gh issue view <n> --json title,body` and take the reporter's vocabulary.
A rename of a user-facing term is its own decision, not a detail to settle here.

### Write

One bullet, appended to the end of `### Features` or `### Bug Fixes` under
`## [Unreleased]` — create the section or the heading only if absent, keeping
`### Features` before `### Bug Fixes`.

- Written for the person using the plugin: what changed for them, never what
  changed in the code. No scopes, no commit hashes, no file names.
- Sentence case. en-US. Describe the capability, not the commit.
- Match the length and depth of the bullets around it — the existing entries are
  the model, and they are substantial: they say what the feature does, what it
  does not do, and what happens at the edges.
- A branch that implements one capability across several commits gets **one**
  bullet, not one per commit.
- A change with nothing user-facing — refactor, test, chore, build, ci, most
  docs — gets **no** entry. Say so and stop.

Then `npx prettier --write CHANGELOG.md`; prettier owns the file's shape.

### Report

Show `git diff CHANGELOG.md`. Do **not** commit, bump the version, or tag —
`/release` is what does those, and it supersedes this stop.

## Mode: audit (`/changelog audit`)

Find what `[Unreleased]` is missing. Used before a release, and useful any time.

```bash
LAST=$(git describe --tags --abbrev=0)
git log "$LAST"..HEAD --no-merges --format='%H %s' | grep -E ' (feat|fix)'
gh issue list --milestone "<next version>" --state closed --json number,title
```

For every `feat`/`fix` commit and every closed milestone issue, decide whether
`[Unreleased]` already covers it — by capability, not by wording; several
commits routinely sit behind one bullet.

Report three lists: commits with no entry, closed milestone issues with no
entry, and entries that match no commit in range (usually a bullet that outlived
a reverted change). Name the commit hashes and issue numbers.

Append bullets for the genuine gaps, following the entry-mode rules above.
Change nothing else. An audit that finds nothing is a result — report it and
stop rather than writing something to have written something.
