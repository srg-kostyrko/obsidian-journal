#!/usr/bin/env bash
# Every input the stage-1 auditors read. See setup.sh's header for why this is a
# script and not a fence.
#
#   inputs.sh <OUT>
#
# Writes bullets.tsv, commits.txt, strings.tsv, stale-quotes.tsv, docs.diff and call-sites.txt.
#
# Every grep here can legitimately match nothing — a release that reworded no string, a range that
# touched no manual page — and `pipefail` turns that into a failed pipeline, so each one that may
# come back empty is wrapped `{ … || true; }` rather than left to kill the run.
set -euo pipefail

OUT="$1"
# shellcheck source=/dev/null
. "$OUT/env.sh"
cd "$ROOT"

# The changelog section under audit, one `kind<TAB>bullet` per line.
in=0
kind=""
while IFS= read -r line; do
  case "$line" in
    "## [$SECTION]"*) in=1 ;;
    "## ["*) in=0 ;;
    "### "*) if [ "$in" = 1 ]; then kind=${line#\#\#\# }; fi ;;
    "- "*) if [ "$in" = 1 ]; then printf '%s\t%s\n' "$kind" "${line#- }"; fi ;;
  esac
done < CHANGELOG.md > "$OUT/bullets.tsv"

git log "$PREV..$UPPER" --no-merges --format='%h %s' > "$OUT/commits.txt"

# Which user-facing strings the range added, removed or reworded. Only single-line values are read;
# a key whose value is a variant object is out of scope. Sorted, because awk's array order is
# unspecified and no later stage should have to care about it.
git diff "$PREV" "$UPPER" -- messages/en.json \
  | { grep -E '^[+-]  "[^"]+": "' || true; } \
  | sed -nE 's/^([+-])  "([^"]+)": "(.*)",?$/\1\t\2\t\3/p' \
  | awk -F'\t' '
      $1 == "-" { old[$2] = $3 }
      $1 == "+" { new[$2] = $3 }
      END {
        for (key in new) if (!(key in old)) print "added\t" key "\t" new[key]
        for (key in old) {
          if (!(key in new)) print "removed\t" key "\t" old[key]
          else if (new[key] != old[key]) print "changed\t" key "\t" old[key] "\t" new[key]
        }
      }
    ' \
  | LC_ALL=C sort > "$OUT/strings.tsv"

git diff "$PREV" "$UPPER" -- docs/user > "$OUT/docs.diff"
{ grep -rn ':help="manual\.' src || true; } > "$OUT/call-sites.txt"

# Stale quotes: the manual quoting UI text the range reworded or removed. Every row's first column
# is its kind, so dropping `added` leaves exactly the rows that have an old text to search for. Bold
# is how the manual quotes a label; plain text is searched too once it is long enough not to match
# ordinary prose by accident.
{ grep -v '^added' "$OUT/strings.tsv" || true; } | while IFS=$'\t' read -r _ key old new; do
  {
    grep -rnF --exclude-dir=.vitepress -- "**$old**" docs/user || true
    if [ ${#old} -ge 20 ]; then
      { grep -rnF --exclude-dir=.vitepress -- "$old" docs/user || true; } | { grep -vF -- "**$old**" || true; }
    fi
  } | while IFS= read -r hit; do
    # printf, not sed: UI text may hold `|`, `&` or `/`, which a sed replacement would misread.
    printf '%s\t%s\t%s\t%s\n' "$key" "$old" "$new" "$hit"
  done
done > "$OUT/stale-quotes.tsv"

printf 'bullets: %s\n' "$(wc -l < "$OUT/bullets.tsv")"
printf 'strings: %s\n' "$(wc -l < "$OUT/strings.tsv")"
printf 'stale quotes: %s\n' "$(wc -l < "$OUT/stale-quotes.tsv")"
