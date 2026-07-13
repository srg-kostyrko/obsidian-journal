# Changelog generation — `/changelog` release-notes command

Status: design, awaiting review
Date: 2026-07-13

## Problem

`git-cliff` (`cliff.toml`, `npm run changelog`) emits one bullet per conventional
commit, grouped by type. That worked when a commit was the release-note unit. In
the v3-ai workflow it isn't: commit boundaries are engineering decisions, and one
user-facing change maps to many commits (e.g. a timeline-layout improvement spans
5–10 `feat(blocks)` commits). The generator is currently unused and stale (last
real entry `2.1.9`), and the range since the last tag is **1292 commits** — a
per-commit changelog would be unusable.

Tightening `git-cliff` type filters does not fix this: no filter turns commit
granularity into release-note granularity. The fix is to change the _unit_ — group
commits into user-facing changes at release time — and to source each changelog
section from the signal that already carries user-facing phrasing.

## Audience & output

End users reading "what changed for me" (GitHub release notes / `CHANGELOG.md`).
Output keeps the existing Keep-a-Changelog structure:

```
## [Unreleased]
### Features
- <one bullet per distinct user-facing feature>
### Bug Fixes
- <one bullet per fixed issue>
```

At release, the `[Unreleased]` heading is renamed to the version + date (unchanged
from today's flow).

## Sourcing (per section)

Each section draws from a different source, chosen so the unit matches the section.

### Features

- Source: `feat` commits in `<lastTag>..HEAD`, **subjects + bodies only** (no diffs,
  no file lists — keeps context tractable at large ranges).
- The LLM lists **every distinct user-facing feature**, grouping the N commits that
  implement one feature into a single bullet. Complete on features, deduped on
  commits.
- Internal-only types (`refactor`, `test`, `style`, `chore`, `build`, `ci`, `docs`)
  never appear. This — not a bullet cap — is what keeps "tiny changes" out.
- For the 3.0.0 rewrite specifically, `docs/2026-06-01-v2-v3-feature-gaps.md` is a
  better feature source than 1292 raw commits; the command may seed from it and the
  human review gate finalizes.

### Bug Fixes

- Source: **union** of
  1. **Milestone** — issues closed under the release milestone
     (`gh issue list --milestone "<version>" --state closed --json number,title`).
  2. **Commit refs** — issues referenced as `fix(es) #N` / `close(s) #N` /
     `resolve(s) #N` in the `<lastTag>..HEAD` range (72 such refs exist today).
- Deduped by issue number. The issue _title_ is the bullet text (already
  user-facing phrasing).
- Fallback: `fix` commits that reference no issue are summarized into their own
  bullets so nothing is silently dropped.

Rationale for union: the milestone is the highest-signal curated source ("this
ships in X") but depends on tagging discipline that is currently inconsistent (2 of
~15 recent closed issues are milestoned). Commit refs catch fixes when the milestone
tag is forgotten. Either source alone leaks; the union is resilient and the review
gate absorbs the extra noise.

## Mechanism

A committed Claude Code command, `/changelog`, run in-session (the alternative — a
standalone Anthropic-API node script — is recorded under Alternatives).

Chosen because:

- Mapping issues ↔ release needs `gh` + judgment, available in-session.
- No `ANTHROPIC_API_KEY` / CI secret to manage.
- Releases are already manual (`version-bump.mjs` + hand tag); there is no headless
  or CI trigger pulling toward a script.

## Flow

```
/changelog [version]                       # version defaults to next; used for milestone lookup
  lastTag  = git describe --tags --abbrev=0            # unprefixed, e.g. 2.1.10
  commits  = git log <lastTag>..HEAD --pretty          # subjects + bodies
  feats    = commits where type == feat
  fixRefs  = issue numbers matched in commit bodies
  msIssues = gh issue list --milestone <version> --state closed
  fixes    = dedupe-by-number(msIssues ∪ gh-view(fixRefs))
  draft:
    ### Features   → grouped user-facing bullets from feats
    ### Bug Fixes  → one bullet per fix (issue title), + no-issue fix-commit fallback
  write draft into ## [Unreleased] of CHANGELOG.md
  show the diff; do not commit, bump, or tag
```

## Review gate & release integration

- The command writes a **draft** into `## [Unreleased]`. It never commits, bumps, or
  tags. The human edits the Unreleased section inline before release — this is the
  quality gate against LLM error/hallucination.
- Release itself is unchanged: edit Unreleased → `npm run version` (version-bump) →
  tag → the Unreleased heading becomes the version+date.

## Retire git-cliff

Remove `cliff.toml` and the `changelog` npm script's `git-cliff` invocation (repoint
`npm run changelog` at the new command, or drop the script and rely on `/changelog`).
Two generators = two sources of truth; `git-cliff` is superseded.

## Alternatives considered

- **Standalone Anthropic-API script** (`scripts/changelog.mjs`): CI-capable, runs
  headless. Rejected because releases are manual and it adds a secret + duplicates
  prompt logic outside the session. Revisit only if changelog generation must run
  unattended.
- **Tune git-cliff filters harder**: treats the symptom, not the unit mismatch.
- **Curate-as-you-go (Keep a Changelog by hand)**: highest signal, but rejected in
  favor of AI-summary so features are listed comprehensively without per-change
  discipline during work.
- **Date-range closed issues** for fixes: rejected as low-signal (close ≠ ship).

## Open considerations

- Milestone discipline: the design only pays off for Fixes if issues get assigned to
  the release milestone on close. The commit-ref fallback covers lapses but the
  milestone remains the primary, cleaner source.
- 3.0.0 first run: enormous range + rewrite; expect heavy human editing of the
  feature list, seeded from the feature-gaps doc rather than raw commits.
