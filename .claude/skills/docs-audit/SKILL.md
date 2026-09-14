---
name: docs-audit
description: Use when cutting a Journals release and the user manual must be checked against what the release ships, or when asked to audit docs/user against a release version or against [Unreleased].
---

# Auditing the manual against a release

The manual at `docs/user/` states behavior, and the pull request that changes a behavior rarely
changes the page. This skill finds what a release made false and fixes it in a docs PR, records what
shipped with no explanation, and surfaces a paragraph whose behavior the code has lost. `/release`
runs it as §1 step 5a, before the release merges.

**Invoking this skill without `--dry-run` authorizes its outward steps** — pushing the fix branch,
opening the PR, opening or editing the issue. It never merges anything.

## Invocation

| Form                    | Audits                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `/docs-audit <version>` | `## [<version>]` over `PREV..<version>`; the tag may be local-only |
| `/docs-audit`           | `## [Unreleased]` over `LAST..HEAD`, mid-cycle                     |

- `--dry-run` — run every stage and commit the fixes on the local branch, then stop before any push,
  PR or issue write; print the PR and issue bodies instead. Never asks the maintainer anything.
- `--base <ref>` — the commit claims are judged against and the fix branch starts from. Default
  `origin/main`.

A mid-cycle run never opens or edits the issue: the release's own run will find the same items.

Create a todo per section and work them in order.

## §0 Setup, guard, resume

```bash
VER=<the version argument, or empty>
BASE=<the --base argument, or origin/main>
ROOT=$(git rev-parse --show-toplevel)     # every command below runs from here
git fetch origin --tags
LABEL=${VER:-unreleased-$(date +%F)}
BRANCH="docs/audit-$LABEL"
OUT=<this session's scratchpad directory>/docs-audit-$LABEL && mkdir -p "$OUT"
git diff --quiet "$BASE" -- src docs/user messages || { echo "checkout differs from $BASE — check it out first"; exit 1; }
gh pr list --head "$BRANCH" --state all --json number,url,state
cat > "$OUT/env.sh" <<EOF
export VER='$VER'
export BASE='$BASE'
export ROOT='$ROOT'
export LABEL='$LABEL'
export BRANCH='$BRANCH'
export OUT='$OUT'
EOF
```

The guard is what lets every agent read the working tree. The release branch passes it: its bump
commit touches only version files and the changelog heading.

**Each shell tool call starts a fresh shell** — `$ROOT`, `$OUT` and everything computed after them
are gone in the next one. From here on, **start every later block with `cd <ROOT> && . <OUT>/env.sh`**,
using the literal paths §0 just printed (not the variable names — this fresh shell has neither set).
Sourcing `env.sh` restores every value written to it so far; §1 and §5 below append to it.

**An existing PR for `$BRANCH`** means stages 2–3 already ran: skip them and link it in the report.
**Stage 1 always runs** — inside a release it decides whether the merge may happen.

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

`SKILL.md` is loaded with every `$`-then-digit token already replaced by this skill's own invocation
arguments — even inside a bash fence, even as an awk field reference. So nothing below spells a
field, a positional parameter or a capture as a dollar sign immediately followed by a digit; sed uses
`\1`-style backreferences instead, and classification runs in Node, where none of that applies.

```bash
cd <ROOT> && . <OUT>/env.sh

in=0; kind=""
while IFS= read -r line; do
  case "$line" in
    "## [$SECTION]"*) in=1 ;;
    "## ["*) in=0 ;;
    "### "*) [ "$in" = 1 ] && kind=${line#\#\#\# } ;;
    "- "*) [ "$in" = 1 ] && printf '%s\t%s\n' "$kind" "${line#- }" ;;
  esac
done < CHANGELOG.md > "$OUT/bullets.tsv"

git log "$PREV..$UPPER" --no-merges --format='%h %s' > "$OUT/commits.txt"

git diff "$PREV" "$UPPER" -- messages/en.json | grep -E '^[+-]  "[^"]+": "' \
  | sed -nE 's/^([+-])  "([^"]+)": "(.*)",?$/\1\t\2\t\3/p' \
  | node -e '
      const lines = require("node:fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
      const oldMap = new Map(), newMap = new Map();
      for (const line of lines) {
        const [sign, key, value] = line.split("\t");
        (sign === "-" ? oldMap : newMap).set(key, value);
      }
      const rows = [];
      for (const [key, value] of newMap) if (!oldMap.has(key)) rows.push(["added", key, value].join("\t"));
      for (const [key, value] of oldMap) {
        if (!newMap.has(key)) rows.push(["removed", key, value].join("\t"));
        else if (newMap.get(key) !== value) rows.push(["changed", key, value, newMap.get(key)].join("\t"));
      }
      rows.sort();
      process.stdout.write(rows.map((r) => r + "\n").join(""));
    ' > "$OUT/strings.tsv"

git diff "$PREV" "$UPPER" -- docs/user > "$OUT/docs.diff"
grep -rn ':help="manual\.' src > "$OUT/call-sites.txt"
```

Only single-line string values are read; a key whose value is a variant object is out of scope.
`strings.tsv` is sorted — awk's array order is unspecified and gave no other stage a reason to care
about row order.

**Stale quotes** are the one finding with no judgment in it. For every `changed` and `removed` row
— every row's first column is its kind, so filtering out `added` keeps exactly those — search the
manual for the old text in bold, and in plain form too when it is 20 characters or longer:

```bash
cd <ROOT> && . <OUT>/env.sh

grep -v '^added' "$OUT/strings.tsv" | while IFS=$'\t' read -r _ key old new; do
  {
    grep -rnF --exclude-dir=.vitepress -- "**$old**" docs/user
    [ ${#old} -ge 20 ] && grep -rnF --exclude-dir=.vitepress -- "$old" docs/user | grep -vF -- "**$old**"
  } | while IFS= read -r hit; do printf '%s\t%s\t%s\t%s\n' "$key" "$old" "$new" "$hit"; done
done > "$OUT/stale-quotes.tsv"
```

`printf`, not `sed`: UI text may hold `|`, `&` or `/`, which a `sed` replacement would misread.

Drop a hit whose line also contains the new text. Every remaining hit goes to the fixer.

## §3 Stage 1 — auditors

Dispatch every auditor in **one message**, each a fresh `general-purpose` agent whose prompt is the
brief beside this file with its `{{...}}` slots filled:

| Brief                | One per                    | Skip when            |
| -------------------- | -------------------------- | -------------------- |
| `entry-auditor.md`   | line of `bullets.tsv`      | —                    |
| `strings-auditor.md` | run, over the `added` rows | no `added` row       |
| `link-auditor.md`    | run                        | `docs.diff` is empty |

Slots: `{{ROOT}}`; `{{KIND}}` and `{{BULLET}}` from the line (small, stay inline); `{{ADDED}}` the
`added` rows as `key<TAB>text` (small, stays inline); `{{COMMITS}}` the **path** of `$OUT/commits.txt`;
`{{DOCS_DIFF}}` the path of `$OUT/docs.diff`; `{{CALL_SITES}}` the path of `$OUT/call-sites.txt`;
`{{PREV}}` and `{{UPPER}}` the range endpoints, for the link auditor's per-page diff command. A real
`docs.diff` runs to thousands of lines — slots whose value is a file carry the path, not the pasted
contents.

**The dispatch wrapper**, appended to every dispatched agent's prompt (auditors here; fixer and
reviewer in §5 and §6): do not invoke any skill; do not spawn subagents; the shell may not keep its
working directory between tool calls, so start every command with `cd {{ROOT}} &&` — or `cd {{WT}} &&`
for the fixer and reviewer, which run in the worktree instead.

Each returns one `json` fence. An agent that returns anything else is re-dispatched once with the
same prompt; a second failure goes in the report as "not audited".

## §4 Triage

- **`regression`** — read the cited code and the `intent` evidence yourself. Evidence from
  `docs/user/` does not count. If the evidence does not hold up, reclassify as `docs-wrong`.
  If it does:
  - with `--dry-run`, it stays `regression`;
  - otherwise ask the maintainer, one question per regression: **fix forward** (it stays
    `regression` and its paragraph is never edited) or **intended** (it becomes `docs-wrong`).
- **`uncovered`** — an entry auditor's `uncovered: true` on a Bug Fixes entry is dropped. A strings
  item with `explainedAt: null` is uncovered. Merge duplicates naming the same behavior.
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

```bash
cd <ROOT> && . <OUT>/env.sh

WT="$(dirname "$ROOT")/$(basename "$ROOT")-docs-audit-$LABEL"
git worktree add -b "$BRANCH" "$WT" "$BASE"
(cd "$WT" && npm ci)
cat >> "$OUT/env.sh" <<EOF
export WT='$WT'
EOF
```

Dispatch a fresh `general-purpose` agent with `fixer.md`, plus the dispatch wrapper (§3, `{{WT}}`
form): `{{WT}}`, `{{FINDINGS}}` as a list with page, line, quote, verdict, evidence and — for stale
quotes — old and new text, and `{{REVIEW_NOTES}}` as "none" in round 1.

## §6 Stage 3 — claim review

Dispatch a fresh `general-purpose` agent — never the fixer — with `reviewer.md`, plus the dispatch
wrapper (§3, `{{WT}}` form): `{{WT}}`, `{{BASE}}`.

- Every claim `confirmed` → commit.
- Any `wrong` or `unsupported` → round 2: dispatch a **new** fixer with the same findings and the
  reviewer's non-confirmed claims as `{{REVIEW_NOTES}}`, then a **new** reviewer.
- Still disputed after round 2 → restore those paragraphs to `$BASE`'s text in `$WT`, and list them
  under **Dropped**.

Then commit one commit per changed file:

```bash
cd <ROOT> && . <OUT>/env.sh && cd "$WT"

for f in $(git diff --name-only); do
  git add "$f" && git commit -m "docs(manual): correct $(basename "$f" .md) for $LABEL"
done
```

## §7 Outputs

### Fix PR

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

```bash
cd <ROOT> && . <OUT>/env.sh && cd "$WT"

git push -u origin "$BRANCH"
gh pr create --base main --head "$BRANCH" --title "docs(manual): correct what $LABEL made stale" --body-file "$OUT/pr-body.md"
git -C "$ROOT" worktree remove "$WT"
```

With `--dry-run`: print the body, leave `$WT` and the local branch for inspection, and say where
they are.

### Uncovered issue

Only when `$VER` is set, something is uncovered, and not `--dry-run`.

```markdown
The <VER> release shipped these without a manual section that explains them.

- [ ] **<label or feature>** — belongs on `<suggested page>` (<setting | command | block | feature>)
```

```bash
cd <ROOT> && . <OUT>/env.sh

TITLE="Manual: document what $VER shipped"
gh issue list --state all --search "in:title \"$TITLE\"" --json number,title --jq ".[] | select(.title == \"$TITLE\") | .number"
gh issue create --title "$TITLE" --label documentation --body-file "$OUT/issue-body.md"   # when none
gh issue edit <n> --body-file "$OUT/issue-body.md"                                        # when one exists
```

When editing, start from the issue's current body: keep every existing line, checked state
included, and append only items whose bold term is not already there.

### Report

`$OUT/docs-audit-$LABEL.md`, private, handed to the maintainer:

1. **Regressions** — quote, page and line, code at `file:line`, the intent evidence, and the
   maintainer's choice. Inside a release, any left as fix-forward stop it before step 6.
2. **Uncovered** — each item, and the issue link.
3. **Dropped** — paragraphs still disputed after two review rounds.
4. **Drift** — commits `main` holds past `$VER`, if any.
5. **Not audited** — agents that failed twice.
6. **Counts** — claims per verdict. Detail only for non-`holds`.
7. The PR link, or "nothing to fix".

## Never

- Never merge the fix PR, or push to `main`.
- Never edit a paragraph whose finding is `regression`.
- Never publish verdicts — in a page, the PR body, a PR comment or the issue.
- Never audit a paragraph no input selected. The range is the scope.
- Never commit with `--no-verify`, or add a `Co-Authored-By` trailer or session link.
- Never let the fixer review its own edits.
