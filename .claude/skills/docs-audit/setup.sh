#!/usr/bin/env bash
# §0 of SKILL.md. These blocks live in scripts beside the skill rather than in a fence inside it
# because SKILL.md is loaded with every `$`-then-digit token already replaced by the skill's own
# invocation arguments — a positional parameter, an awk field or a sed capture cannot be written
# there at all. Here they can, so the code is written the way it would be written anywhere.
#
#   setup.sh --scratch <dir> [--version <x.y.z>] [--base <ref>] [--in-place]
#
# Prints ROOT, OUT and PR_COUNT, and writes $OUT/env.sh for every later block to source.
set -euo pipefail

VER=""
BASE=""
IN_PLACE=""
SCRATCH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VER="$2"; shift 2 ;;
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
LABEL="${VER:-unreleased-$(date +%F)}"
BRANCH="docs/audit-$LABEL"
START=$(git rev-parse HEAD)
OUT="$SCRATCH/docs-audit-$LABEL"
mkdir -p "$OUT"

# The reviewer reads the fixer's work as a diff and §6 commits it per file with `git add -A
# docs/user`, so anything already uncommitted under the paths the audit writes would be swept into
# those commits as if the fixer had written it. `git status --porcelain`, not `git diff --quiet`:
# the latter does not see an untracked file, which is exactly what `add -A` would pick up. Scoped to
# those paths so that an unrelated dirty file — test-vault/.obsidian/community-plugins.json dirties
# itself whenever the plugin has been run locally — does not block an audit that cannot touch it.
if [ -n "$(git status --porcelain -- docs/user messages)" ]; then
  echo "docs/user or messages has uncommitted changes — commit or discard first" >&2
  git status --short -- docs/user messages >&2
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

cat > "$OUT/env.sh" <<EOF
export VER='$VER'
export IN_PLACE='$IN_PLACE'
export BASE='$BASE'
export BASE_BRANCH='${BASE#origin/}'
export ROOT='$ROOT'
export LABEL='$LABEL'
export BRANCH='$BRANCH'
export START='$START'
export PR_COUNT='$PR_COUNT'
export OUT='$OUT'
EOF

echo "ROOT=$ROOT"
echo "OUT=$OUT"
echo "PR_COUNT=$PR_COUNT"
