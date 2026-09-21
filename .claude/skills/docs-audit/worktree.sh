#!/usr/bin/env bash
# The fixer's worktree, cut only when `--in-place` was not passed. See setup.sh's
# header for why this is a script and not a fence.
#
#   worktree.sh <OUT>
set -euo pipefail

OUT="$1"
# shellcheck source=/dev/null
. "$OUT/env.sh"
cd "$ROOT"

WT="$(dirname "$ROOT")/$(basename "$ROOT")-docs-audit-$LABEL"

# A dry run leaves the worktree and the local branch behind, and a real run leaves the local branch
# after the worktree is removed. Without this check the `worktree add -b` below would fail on the
# branch and then carry on into the stale worktree. Either one holds a previous run's commits, so
# the orchestrator stops and tells the maintainer: this script never deletes them.
if git show-ref --verify --quiet "refs/heads/$BRANCH" || [ -e "$WT" ]; then
  echo "leftover branch $BRANCH or worktree $WT from a previous run — remove it by hand, this never deletes it" >&2
  exit 1
fi

git worktree add --no-track -b "$BRANCH" "$WT" "$BASE"
(cd "$WT" && npm ci)
echo "export WT='$WT'" >> "$OUT/env.sh"
echo "WT=$WT"
