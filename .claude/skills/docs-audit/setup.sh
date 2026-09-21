#!/usr/bin/env bash
# §0 of SKILL.md. These blocks live in scripts beside the skill rather than in a fence inside it
# because SKILL.md is loaded with every `$`-then-digit token already replaced by the skill's own
# invocation arguments — a positional parameter, an awk field or a sed capture cannot be written
# there at all. Here they can, so the code is written the way it would be written anywhere.
#
#   setup.sh --scratch <dir> [--version <x.y.z>] [--label <text>] [--base <ref>] [--in-place]
#
# Prints ROOT, OUT and PR_COUNT, and writes $OUT/env.sh for every later block to source.
set -euo pipefail

VER=""
LABEL=""
BASE=""
IN_PLACE=""
SCRATCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VER="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --scratch) SCRATCH="$2"; shift 2 ;;
    --in-place) IN_PLACE=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$SCRATCH" ] || { echo "--scratch <this session's scratchpad directory> is required" >&2; exit 2; }

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
git fetch origin --tags

HERE=$(git rev-parse --abbrev-ref HEAD)
if [ -z "$BASE" ]; then
  if [ -n "$IN_PLACE" ]; then BASE="$HERE"; else BASE="origin/main"; fi
fi
# --label names the run when no version argument can be given. /release step 4 runs before the bump,
# so there is no tag for §1 to describe from, but its commits and its report should still say which
# release they belong to rather than `unreleased-<today>`.
LABEL="${LABEL:-${VER:-unreleased-$(date +%F)}}"
BRANCH="docs/audit-$LABEL"
START=$(git rev-parse HEAD)
OUT="$SCRATCH/docs-audit-$LABEL"
mkdir -p "$OUT"

# The reviewer reads the fixer's work as a diff and §6 commits it per file with `git add -A
# docs/user`, so anything already uncommitted under the paths the audit writes would be swept into
# those commits as if the fixer had written it. `git status --porcelain`, not `git diff --quiet`:
# the latter does not see an untracked file, which is exactly what `add -A` would pick up. Scoped to
# the three paths the audit can commit to — CHANGELOG.md among them, since §4 may correct a bullet
# the code contradicts — so that an unrelated dirty file, and test-vault/.obsidian/community-
# plugins.json dirties itself whenever the plugin has been run locally, does not block an audit that
# cannot touch it.
WRITES="docs/user messages CHANGELOG.md"
# shellcheck disable=SC2086
if [ -n "$(git status --porcelain -- $WRITES)" ]; then
  echo "the audit writes to $WRITES, and one of them has uncommitted changes — commit or discard first" >&2
  # shellcheck disable=SC2086
  git status --short -- $WRITES >&2
  exit 1
fi

PR_COUNT=0
if [ -n "$IN_PLACE" ]; then
  [ "$HERE" != "main" ] || { echo "--in-place on main: main is protected and takes no direct commit" >&2; exit 1; }
else
  gh pr list --head "$BRANCH" --state all --json number,url,state
  PR_COUNT=$(gh pr list --head "$BRANCH" --state all --json state \
    --jq '[.[] | select(.state == "OPEN" or .state == "MERGED")] | length')
  if [ "$PR_COUNT" -gt 0 ]; then
    echo "an open or merged PR for $BRANCH already exists — guard skipped, stage 1 judges the checkout as it stands"
  elif [ -n "$VER" ]; then
    git diff --quiet "$BASE" -- docs/user messages \
      || { echo "checkout differs from $BASE — check it out first" >&2; exit 1; }
  else
    git diff --quiet "$BASE" -- src docs/user messages \
      || { echo "checkout differs from $BASE — check it out first" >&2; exit 1; }
  fi
fi

# printf %q, not '$VAR' between apostrophes: --label is free-form and a repository or scratch path
# may hold an apostrophe, either of which would end the assignment early and leave the rest of the
# value to be read as shell syntax by every later block that sources this file.
{
  printf 'export VER=%q\n' "$VER"
  printf 'export IN_PLACE=%q\n' "$IN_PLACE"
  printf 'export BASE=%q\n' "$BASE"
  printf 'export BASE_BRANCH=%q\n' "${BASE#origin/}"
  printf 'export ROOT=%q\n' "$ROOT"
  printf 'export LABEL=%q\n' "$LABEL"
  printf 'export BRANCH=%q\n' "$BRANCH"
  printf 'export START=%q\n' "$START"
  printf 'export PR_COUNT=%q\n' "$PR_COUNT"
  printf 'export OUT=%q\n' "$OUT"
} > "$OUT/env.sh"

echo "ROOT=$ROOT"
echo "OUT=$OUT"
echo "PR_COUNT=$PR_COUNT"
