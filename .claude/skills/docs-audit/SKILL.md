---
name: docs-audit
description: Use when cutting a Journals release and the user manual must be checked against what the release ships, or when asked to audit docs/user against a release version or against [Unreleased].
---

# Auditing the manual against a release

The manual at `docs/user/` states behavior, and the pull request that changes a behavior rarely
changes the page. This skill finds what a release made false and fixes it, finds what shipped with
no explanation at all, and surfaces a paragraph whose behavior the code has lost. `/release` runs it
as §1 step 4, **before the version is bumped and the tag cut** — so every correction it makes is an
ancestor of the tag, which is the only tree the published manual's root is ever built from.

**Invoking this skill without `--dry-run` authorizes its outward steps** — committing the fixes, and
under `--in-place`'s absence pushing the fix branch and opening the PR. It never merges anything, and
it never files an issue: a gap it finds inside a release is written before the tag, not deferred to
after it.

## Invocation

| Form                    | Audits                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `/docs-audit <version>` | `## [<version>]` over `PREV..<version>`; the tag may be local-only |
| `/docs-audit`           | `## [Unreleased]` over `LAST..HEAD`                                |

- `--in-place` — commit the fixes onto the **current branch**, with no worktree, no fix branch and
  no pull request. What `/release` step 4 passes: the branch it is standing on is the branch the tag
  will be cut from, so the fix reaches the tag by sitting still. Without it the fixes go on their own
  branch and open a PR, which is what a standalone run on protected `main` needs.
- `--dry-run` — run every stage and leave the fixes uncommitted, then stop before any commit, push or
  PR; print the PR body instead. Never asks the maintainer anything.
- `--base <ref>` — the commit claims are judged against. Without `--in-place` the fix branch also
  starts from it. Default `origin/main`, or the current branch under `--in-place`.

Create a todo per section and work them in order.

## §0 Setup, guard, resume

```bash
bash .claude/skills/docs-audit/setup.sh \
  --scratch <this session's scratchpad directory> \
  [--version <x.y.z>] [--base <ref>] [--in-place]
```

It resolves `$BASE` (the `--base` argument; else the current branch under `--in-place`; else
`origin/main`), computes `$LABEL`, `$BRANCH`, `$START` and `$OUT`, applies the guard, and writes
`$OUT/env.sh`. It prints `ROOT`, `OUT` and `PR_COUNT`.

**The multi-line blocks of this skill live in scripts beside it — `setup.sh`, `inputs.sh`,
`worktree.sh` — and not in fences here.** `SKILL.md` is loaded with every `$`-then-digit token
already replaced by this skill's own invocation arguments, inside a bash fence included, so a
positional parameter, an awk field or a sed capture cannot be written on this page at all. The
scripts are under no such constraint, and they are not retyped by an agent on every run.

**`--in-place` needs no guard and gets none.** The whole point of it is that the checkout, the claims
being judged and the tree the fix lands in are one and the same, so there is nothing for a guard to
compare. What it does require is that `docs/user` and `messages` carry nothing uncommitted — §6
commits the fixer's work with `git add -A docs/user`, which would otherwise sweep in whatever was
already there, untracked files included — and a branch that is not `main`.

**Without `--in-place`, a printed `PR_COUNT` above zero** means an open or merged PR for `$BRANCH`
exists and stages 2–3 already ran: skip them, skip the guard entirely, and link the PR in the report
— stage 1 judges claims against the checkout as it stands. **Stage 1 always runs** — inside a release
it decides whether the tag may be cut.

The guard, when it applies, is what lets every agent read the working tree as the claims it judges.
It always requires `docs/user` and `messages` to match `$BASE`; it requires `src` to match `$BASE`
too, but only when `$VER` is empty — a release checkout is the code that ships, fix-forwards
included, while the fix branch still starts from `$BASE`, so mid-cycle `src` must agree with `$BASE`
and a release run must not demand that.

`$START` is the commit the audit began at. Under `--in-place` the reviewer compares against it rather
than against `$BASE`, which is the branch itself and moves the moment §6 commits.

**Each shell tool call starts a fresh shell** — `$ROOT`, `$OUT` and everything computed after them
are gone in the next one. From here on, **start every later block with `cd <ROOT> && . <OUT>/env.sh`**,
using the literal paths §0 just printed (not the variable names — this fresh shell has neither set).
Sourcing `env.sh` restores every value written to it so far; §1 and §5 below append to it.

## §1 Range

```bash
cd <ROOT> && . <OUT>/env.sh
if [ -n "$VER" ]; then
  PREV=$(git describe --tags --abbrev=0 "$VER^")
  test "$PREV" != "$VER" || { echo "refusing to compare the release against itself"; exit 1; }
  UPPER="$VER"; SECTION="$VER"
else
  PREV=$(git describe --tags --abbrev=0 HEAD); UPPER=HEAD; SECTION=Unreleased
fi
cat >> "$OUT/env.sh" <<EOF
export PREV='$PREV'
export UPPER='$UPPER'
export SECTION='$SECTION'
EOF
```

The `^` is load-bearing: during release step 5a the local `$VER` tag already sits at `HEAD`, and a
bare `describe` would resolve to it.

## §2 Inputs

```bash
cd <ROOT> && bash .claude/skills/docs-audit/inputs.sh <OUT>
```

| File               | Holds                                                            |
| ------------------ | ---------------------------------------------------------------- |
| `bullets.tsv`      | the audited changelog section, one `kind<TAB>bullet` per line    |
| `commits.txt`      | `PREV..UPPER`, one `hash subject` per line                       |
| `strings.tsv`      | `added`/`removed`/`changed` rows from `messages/en.json`, sorted |
| `stale-quotes.tsv` | manual lines quoting UI text the range reworded or removed       |
| `docs.diff`        | the range's diff over `docs/user`                                |
| `call-sites.txt`   | every `:help="manual.` in `src`, for the link auditor            |

Only single-line string values are read; a key whose value is a variant object is out of scope.

**Stale quotes are the one finding with no judgment in them** — the manual quotes a label the release
has since relabelled, so the quote is wrong on its face. Drop a `changed` row's hit whose line also
contains the new text; a `removed` row has no new text to compare against, so keep every one of its
hits. Every remaining hit goes to the fixer.

## §3 Stage 1 — auditors

Dispatch every auditor in **one message**, each a fresh `general-purpose` agent whose prompt is the
brief beside this file with its `{{...}}` slots filled:

| Brief                | One per                                  | Skip when                   |
| -------------------- | ---------------------------------------- | --------------------------- |
| `entry-auditor.md`   | line of `bullets.tsv`                    | —                           |
| `strings-auditor.md` | run, over the `added` and `changed` rows | neither row kind is present |
| `link-auditor.md`    | run                                      | `docs.diff` is empty        |

Slots: `{{ROOT}}`; `{{KIND}}` and `{{BULLET}}` from the line (small, stay inline); `{{STRINGS}}` the
`added` and `changed` rows as `kind<TAB>key<TAB>text` (small, stays inline); `{{COMMITS}}` the
**path** of `$OUT/commits.txt`; `{{DOCS_DIFF}}` the path of `$OUT/docs.diff`; `{{CALL_SITES}}` the
path of `$OUT/call-sites.txt`; `{{PREV}}` and `{{UPPER}}` the range endpoints, for the link auditor's
per-page diff command; `{{PRIOR}}` the agent's own verdict from a previous run, or `none`. A real
`docs.diff` runs to thousands of lines — slots whose value is a file carry the path, not the pasted
contents.

**Write every returned fence to `$OUT/verdicts-<n>.json`**, `<n>` counting from 1 per stage-1 pass,
then fill `{{PRIOR}}` on the next pass from the newest file that holds a verdict for the same bullet
or key. A re-run — after a fix-forward, or after the maintainer answers a regression — is where this
pays: at 3.5.0 a scoped second pass of 6 agents found **three claims the full 39-agent first pass had
missed**, because an auditor handed a prior verdict to defend digs a layer deeper than one forming a
first opinion. One wide pass is not equivalent to two.

**The dispatch wrapper**, appended to every dispatched agent's prompt (auditors here; fixer and
reviewer in §5 and §6): do not invoke any skill; do not spawn subagents; the shell may not keep its
working directory between tool calls, so start every command with `cd {{WORK}} &&`. `{{WORK}}` is
`$ROOT` for the auditors and, for the fixer and reviewer, `$WT` when a worktree was cut and `$ROOT`
under `--in-place`.

Each returns one `json` fence. An agent that returns anything else is re-dispatched once with the
same prompt; a second failure goes in the report as "not audited".

## §4 Triage

- **Stages 2–3 skipped** — when an existing open or merged PR for `$BRANCH` means the fixer does not
  run (§0), every finding that would have gone to it — including a regression the maintainer answers
  **intended** — is listed in the report under **Not fixed — PR already open**, for the maintainer to
  add to that PR themselves.
- **`regression`** — read the cited code and the `intent` evidence yourself. Evidence from
  `docs/user/` does not count. If the evidence does not hold up, reclassify as `docs-wrong`.
  If it does:
  - with `--dry-run`, it stays `regression`;
  - otherwise ask the maintainer, one question per regression: **fix forward** (it stays
    `regression` and its paragraph is never edited) or **intended** (it becomes `docs-wrong`).
- **`entryVerdict` other than `holds`** — the changelog bullet itself states behavior the code does
  not have. Read the cited code yourself before believing it. Then:
  - with `--dry-run`, report it and change nothing;
  - otherwise ask the maintainer, one question per bullet, quoting the bullet and the code:
    **correct it** or **leave it**. "Never rewrite an existing bullet" protects the author's voice,
    not a false claim, so a correction changes only the clause the code contradicts and keeps their
    wording everywhere else. 3.5.0 shipped three such bullets, every one accurate when written and
    invalidated by a later commit in the same cycle.
- **A string whose claim the code contradicts** — the strings auditor's `truth` other than `holds`.
  This is a code defect, not a docs one: ask the maintainer the same way, and on **correct it** edit
  `messages/en.json` **line-wise**, never by parsing and re-serializing the file. 3.5.0 nearly shipped
  two, and neither the changelog step nor any docs check would have caught them.
- **`uncovered`** — an entry auditor's `uncovered: true` on a Bug Fixes entry is dropped, and so is one on a feature only plugin developers meet (the plugin API, which `docs/plugin-api.md` owns). A strings
  item with `explainedAt: null` is uncovered. Merge duplicates naming the same behavior. Then, unless
  `--dry-run`, ask the maintainer one question per item: **write it now** or **ruled out**, with a
  reason.
  - **write it now** — the item is prose that does not exist yet, so it is `/docs-authoring`'s job,
    not the fixer's. Under `--in-place` it is written and committed on this branch before the skill
    returns, and the release waits for it.
  - **ruled out** — the reason goes in the report and nothing is written.

  **Nothing is deferred.** No issue is filed for an uncovered item, in a release run or outside one.
  A gap recorded for later cannot reach the published root at all: the root is built from the tag's
  tree, so prose merged after the tag lands on `/next/` and waits for the next minor. #483 is the
  worked example — three features 3.5.0 shipped, documented the following day, and absent from the
  root manual that describes 3.5.0.

- **Duplicates** — a `does-not-explain` target whose cause is already a stale quote, a
  `docs-wrong`/`unsupported` claim or an `uncovered` item is merged into that finding and not sent to
  the fixer separately; only its remaining causes go to the fixer. Anything `uncovered` never goes to
  the fixer.
- **Fixer input** — every `docs-wrong`, `unsupported`, stale quote and remaining `does-not-explain`
  target.
- **Drift** — when `$VER` is set, run (after `cd <ROOT> && . <OUT>/env.sh`):
  `git log --oneline "$VER..$BASE" -- src | wc -l`. Non-zero means `main` has moved past the release;
  a paragraph describing that newer behavior correctly is not a finding.

## §5 Stage 2 — fixer

Skip when the fixer input is empty or the PR already exists.

**Under `--in-place` there is no worktree and no fix branch.** The tree the auditors judged is the
tree the fix belongs in, so the fixer edits `$ROOT` directly and `$WORK` is `$ROOT`. That is not a
shortcut: the worktree exists because, in the branch-and-PR shape, the audited checkout and the
commit the fix must be based on are two different trees and only one can be checked out.
`--in-place` collapses them into one, which also spares the worktree's `npm ci` — the live checkout
already has `node_modules`. Skip straight to the dispatch.

Otherwise cut the worktree:

```bash
cd <ROOT> && bash .claude/skills/docs-audit/worktree.sh <OUT>
```

It refuses to run when a branch or worktree from a previous run is still there, because either holds
that run's commits; it never deletes them, so clearing them is the maintainer's call. On success it
appends `WT` to `env.sh` and prints it.

Dispatch a fresh `general-purpose` agent with `fixer.md`, plus the dispatch wrapper (§3):
`{{ROOT}}` as the audited checkout's root, `{{WORK}}` as the tree to edit, `{{FINDINGS}}` as a list
with page, line, quote, verdict, evidence and — for stale quotes — old and new text; a stale quote
from a `removed` row carries no new text, so carry the release's `added` rows from `strings.tsv`
alongside it, so the fixer can find the replacement label. `{{REVIEW_NOTES}}` as "none" in round 1.

## §6 Stage 3 — claim review

Dispatch a fresh `general-purpose` agent — never the fixer — with `reviewer.md`, plus the dispatch
wrapper (§3): `{{ROOT}}` as the audited checkout's root, `{{WORK}}` as the tree the fixer edited,
`{{BEFORE}}` — `$BASE` when a worktree was cut, `$START` under `--in-place`, because there `$BASE` is
the branch itself and moves the moment anything is committed — and `{{FINDINGS}}`, the same list the
fixer received.

- Every claim `confirmed` → commit.
- Any `wrong` or `unsupported` → round 2: dispatch a **new** fixer with the same findings and the
  reviewer's non-confirmed claims as `{{REVIEW_NOTES}}`, then a **new** reviewer.
- Still disputed after round 2 → restore those paragraphs to `{{BEFORE}}`'s text, and list them
  under **Dropped**.

Then commit one commit per changed file. `git diff --name-only` misses files the fixer created, so
stage everything under `docs/user` first and commit per staged file. `$WORK` is the worktree, or
`$ROOT` under `--in-place`; with `--dry-run`, skip this block and leave the edits uncommitted for
inspection with `git diff`:

```bash
cd <ROOT> && . <OUT>/env.sh && cd "$WORK"

git add -A docs/user
for f in $(git diff --cached --name-only); do
  git commit -m "docs(manual): correct $(basename "$f" .md) for $LABEL" -- "$f"
done
```

A string the maintainer chose to correct is committed here too, separately —
`git commit -m "fix(i18n): correct <key> for $LABEL" -- messages/en.json` — and a corrected changelog
bullet as `docs(changelog): correct <what> for $LABEL`. Neither is a manual page, so neither belongs
in the loop above, and both are ordinary source fixes that the release's own gate will run over.

## §7 Outputs

### Fix PR — only without `--in-place`

Under `--in-place` there is no PR: the fixes are already commits on the branch the caller is
standing on, and §6 named them. Skip to the report.

Body, in user terms — **no verdict list**, no changelog entry, no `Co-Authored-By`, no session link.
One bullet per page; a page with several causes names each, in whichever of these three forms its
cause takes — a changelog entry made it stale, a relabelled UI string did, or a link now lands on a
section that no longer explains it:

```markdown
## What and why

<LABEL> changed behavior these pages describe.

- **<page title>** — <what now reads differently>. Made stale by: “<first sentence of the entry>”
- **<page title>** — <what now reads differently>. Made stale by the label **<old text>** becoming
  **<new text>**.
- **<page title>** — <what now reads differently>. Its settings section's **?** link landed on a
  section that no longer explained it.

## Checks

`check:docs-mustaches`, `docs:build` and `check:docs-links` pass on this branch, and every changed
claim was checked against the code by a reviewer that did not write it.
```

Write the body to `$OUT/pr-body.md`. With `--dry-run`, skip the block below: print the body, leave
`$WT` and the local branch for inspection, and say where they are. Otherwise:

```bash
cd <ROOT> && . <OUT>/env.sh && cd "$WT"

git push -u origin "$BRANCH"
gh pr create --base "$BASE_BRANCH" --head "$BRANCH" --title "docs(manual): correct what $LABEL made stale" --body-file "$OUT/pr-body.md"
git -C "$ROOT" worktree remove "$WT"
```

`$BASE_BRANCH` is `$BASE` with any `origin/` stripped — the branch the fix was cut from, which is
what it must merge back into. Hardcoding `main` here was a live bug: it targeted a branch the fix was
not based on whenever `--base` said otherwise.

### No issue, ever

There is no "Manual: document what `$VER` shipped" issue, and filing one is not an option this skill
offers. Every gap it finds is either written before the tag or ruled out on the record (§4); a gap
carried past the tag cannot reach the published root at all, because the root is built from the tag's
tree. #483 is what that looked like: filed by the 3.5.0 audit as "not blocking any release", written
the next day, and live on `/next/` while the root went on describing 3.5.0 without three features
3.5.0 had shipped.

### Report

`$OUT/docs-audit-$LABEL.md`, private, handed to the maintainer:

1. **Regressions** — quote, page and line, code at `file:line`, the intent evidence, and the
   maintainer's choice. Inside a release, any left as fix-forward stop it before the tag is cut.
2. **Wrong bullets and wrong strings** — the claim, the code that contradicts it, and the
   maintainer's choice. A corrected one names its commit.
3. **Uncovered** — each item, and for each the maintainer's choice: the commit that now documents it,
   or the reason it was ruled out. No item is left without one of the two.
4. **Not fixed — PR already open** — only when §0 found an existing open or merged PR and skipped
   stages 2–3: every finding that would have gone to the fixer, page, line, quote, verdict and
   evidence, for the maintainer to add to that PR themselves.
5. **Dropped** — paragraphs still disputed after two review rounds.
6. **Drift** — commits `main` holds past `$VER`, if any.
7. **Not audited** — agents that failed twice.
8. **Counts** — claims per verdict. Detail only for non-`holds`.
9. The commits made, under `--in-place`; otherwise the PR link, or "nothing to fix".

## Never

- Never merge the fix PR, or push to `main`.
- Never edit a paragraph whose finding is `regression`.
- Never publish verdicts — in a page, the PR body or a PR comment.
- Never file an issue for a gap. Write it, or record why it was ruled out.
- Never rewrite a changelog bullet or a shipped string except the clause the code contradicts, and
  never without the maintainer's word.
- Never audit a paragraph no input selected. The range is the scope.
- Never commit with `--no-verify`, or add a `Co-Authored-By` trailer or session link.
- Never let the fixer review its own edits.
