---
name: release
description: Use when cutting a Journals release — bumping the plugin to a new version, shipping a beta build, publishing the obsidian-journals-api npm package, or picking up a release that stopped part-way.
---

# Releasing Journals

Maintainer runbook, executed rather than read. It covers the whole arc: gates,
changelog audit, manual audit, bump, tag, draft, publish, npm package, then the
issue-tracker and community work that follows a release.

**Every prose correction the release needs is made before the tag is cut.** A
manual claim, a changelog bullet or a shipped string the code contradicts, and a
feature that shipped with nothing explaining it, are all settled at step 4 —
none of them is filed for later. A tag is the only route to the published
manual's root, so "later" means the release after this one.

**Invoking this skill is the authorization for every outward step below** —
pushing a branch, merging the release PR, pushing the tag, publishing the
release, publishing to npm. Do not stop to ask permission for those again.

Three things are never done unattended, because each goes out in the maintainer's
own voice: **cross-links into issues the release did not close**, the **next
milestone's theme**, and the **Discord announcement**. Draft them, hand them
over, and let the maintainer act.

## Invocation

| Form                        | Runs                            |
| --------------------------- | ------------------------------- |
| `/release`                  | Stable release; version derived |
| `/release 3.4.0`            | Stable release at that version  |
| `/release beta 3.4.0-beta1` | Beta build only                 |
| `/release api`              | The npm package only (§2)       |
| `/release post`             | Post-release phase only (§3)    |

Create a todo per step and work them in order.

## §0 Preflight and resume

Never assume you are starting at step 1. A release that died half-way leaves
state behind, and redoing a step that already ran is how a version gets spent
twice.

```bash
git switch main && git pull --ff-only
git status --short
gh auth status
npm whoami
```

- **A dirty tree stops the release**, with one exception:
  `test-vault/.obsidian/community-plugins.json` dirties itself whenever the
  plugin has been run locally. That file — and only that file — may be
  discarded: `git checkout -- test-vault/.obsidian/community-plugins.json`.
  Anything else dirty: stop and report.
- **`npm whoami` returning 401 does not block the plugin release.** It blocks §2,
  and `npm login` is interactive. Say so now, in the first report, so the
  maintainer can re-authenticate while the build runs. Discovering it after the
  release notes are public leaves those notes describing an API surface nobody
  can install.

Then work out where you already are:

```bash
VER=<x.y.z>
git tag -l "$VER"                                  # local tag exists?
git ls-remote --tags  origin "$VER"                # tag pushed?
git ls-remote --heads origin "release/$VER"        # branch pushed?
grep '"version"' manifest.json                     # already bumped?
gh pr list --head "release/$VER" --state all --json number,state
gh release view "$VER" --json isDraft,publishedAt 2>/dev/null
npm view obsidian-journals-api version
git show-ref --verify --quiet "refs/heads/release/$VER" && echo "local branch exists"
# Manual deployed since the release was published? Step 9 dispatches it by hand, so a
# release that died in the window between publishing and dispatching leaves the root on
# the previous version, and nothing downstream would notice.
PUB=$(gh release view "$VER" --json publishedAt --jq '.publishedAt // empty' 2>/dev/null)
gh run list --workflow=pages.yml --event workflow_dispatch --limit 10 \
  --json createdAt,conclusion --jq "[.[] | select(.createdAt >= \"${PUB:-9999}\" and .conclusion == \"success\")] | length"
```

| Observed                                 | Resume at              |
| ---------------------------------------- | ---------------------- |
| Nothing exists                           | §1 step 1              |
| Local branch exists, manifest not bumped | §1 step 4              |
| Manifest bumped, no branch on remote     | §1 step 6              |
| Branch pushed, PR open                   | §1 step 7              |
| PR merged, tag not on remote             | §1 step 8              |
| Tag pushed, release still a draft        | §1 step 9              |
| Published, no pages run since            | §1 step 9's dispatch   |
| Release published, npm behind            | §2, then step 9's tail |
| Everything shipped                       | §3                     |

**The manual deploy is the one step a resume can silently skip.** Every other artefact
announces its own absence — an unpushed tag, a draft release, a stale npm version — but
a root manual left on the previous release looks exactly like one that deployed. That
is the cost of dispatching by hand rather than on the `release` event, so the count
above is part of the resume detection, not an afterthought: **zero means step 9's
dispatch still has to run**, whatever else is already done.

Resuming anywhere from step 4 to step 7 starts with `git switch "release/$VER"` (and
`git pull --ff-only` if the branch is pushed) — preflight left the checkout on `main`, which has
neither the changelog commit, the promoted `## [$VER]` heading nor any fix-forward. Resuming past
step 7 needs no switch, since the release branch has already merged into `main`.

**Step 4 has no artefact to detect, so a resume that cannot rule it out runs it again.** An audit
that found nothing leaves no trace — no commit, no branch, no issue — and one that found something
leaves ordinary `docs(manual):` commits on the branch that a fix-forward looks exactly like. Re-running
costs time, not correctness. What is _not_ safe is skipping it: a resume that enters at step 5 with the
audit never run cuts a tag over prose nobody checked. Where the tag is already pushed, step 4 can no
longer reach the root — run `/docs-audit $VER` anyway before §3 and report what it finds, since the
next release carries the fix.

### Choosing the version

1. An explicit argument wins.
2. Otherwise the single open milestone's title.
3. Otherwise derive it: any `feat` subject in `git log <lastTag>..HEAD
--no-merges` → **minor**; only `fix` → **patch**.

Classify by what the user gets, not by how much code moved: a fix that needed a
large refactor is still a patch. Report the derivation. If the milestone and the
derivation disagree, the milestone wins and the disagreement goes in the report.

`minAppVersion` is a manual edit and never changes as part of a release.
Raising it also raises the floor of the e2e matrix — `wdio.conf.mts` resolves
its `earliest` spec from it. If it looks stale, say so and proceed without
touching it.

## §1 Ship

### Step 1 — Gates

Mirror `checks.yml` exactly, in its order — it is what reports as the `build`
check that blocks the merge button:

```bash
npm ci
npm run compile:i18n && npm run check:i18n && npm run check:types
npm run coverage && npm run check:lint && npm run build:api && npm run check:api
npm run check:changelog
```

`compile:i18n` before `check:types`, always — `src/i18n/paraglide` is generated
and git-ignored, so type-checking a fresh checkout fails without it.

**`npm run coverage`, never `npm test`.** They run the same suite, but only
`coverage` applies the floor CI gates on, so a green `npm test` says nothing
about whether `build` will pass.

**Do not run the e2e suites locally.** The release PR's `e2e-gate` runs smoke,
integration, migration, interop and journeys across ubuntu, windows and macOS at
`latest/latest`, sharded two ways — a strict superset of a local single-OS pass
at the same version combo. Nothing irreversible happens before that gate is
green, because the tag stays local until the PR merges, so a red gate costs a
reset and never a spent version.

### Step 2 — Audit the changelog; never regenerate it

Entries are written **per pull request** into `## [Unreleased]`, in the voice of
the person who made the change. That prose is not yours to rewrite. Your job is
to find what is **missing**.

```bash
LAST=$(git describe --tags --abbrev=0)
git log "$LAST"..HEAD --no-merges --format='%H %s' | grep -E ' (feat|fix)'
git log "$LAST"..HEAD --no-merges --format='%h %s' -- CHANGELOG.md
gh issue list --milestone "$VER" --state closed --json number,title
```

Walk every `feat`/`fix` commit and every closed milestone issue, and check
whether `[Unreleased]` already covers it. Gaps happen — a PR that forgot its
entry, or a surface that grew after the entry was written.

**Count issues with `gh issue list --milestone`, above, and never with the
milestone API.** `gh api repos/.../milestones`' `closed_issues` counts pull
requests alongside issues: it reported 31 for 3.5.0, where the real figure was
22 issues and 9 PRs. A preflight report that opens with that number opens with a
wrong one.

**A commit that touched `CHANGELOG.md` is not evidence that it added an entry.**
Check the diff, not the file list:

```bash
git show <sha> -- CHANGELOG.md | grep -E '^\+[^+]'      # empty means no bullet
```

3.4.0's weekday-picker fix is the worked example: it touched `CHANGELOG.md`, and
its whole diff there was the deletion of one blank line.

**Append** the missing bullets under the existing `### Features` /
`### Bug Fixes` headings, matching the surrounding bullets' voice: what changed for the person using the plugin,
sentence case, no scopes, no commit hashes, the issue's own vocabulary.

Leave the `## [Unreleased]` heading itself alone — `version-bump.mjs` promotes
it in step 5. Run `npx prettier --write CHANGELOG.md`; prettier owns the file's
shape. **Do not commit yet** — step 3 may add a `packages/api` bump that belongs
in the same commit, and the bump commit in step 5 has to carry only the
promotion.

If the audit finds nothing missing, say so and move on — an empty audit is a
result, not a reason to write something.

**Whether an existing bullet is still _true_ is step 4's job, not this one.**
Every false claim 3.5.0 shipped was accurate when written and was invalidated by
a later commit in the same cycle, which is a re-derivation from code rather than
a walk of what is missing. Do not attempt it here; step 4's entry auditor holds
the bullet and the code side by side and settles it properly.

### Step 3 — Branch, then the API package bump

Branch **first**. Nothing from here to step 6 needs to be on `main`, and leaving
it there is how 3.5.0's abandoned first attempt left local `main` two commits
ahead of `origin/main` and broke a later `git pull --ff-only` in a way that read
as a failed merge.

```bash
git switch -c "release/$VER"
```

Then run §2's detection and version rule — the bump, not the publish, which
waits for a green tag build. If it does not fire, leave
`packages/api/package.json` alone entirely.

If it does fire, **name the new package version in the changelog bullet that
describes the surface**, here and not later. §2 runs after the release notes are
published from this section verbatim, so an edit there desyncs the file from the
notes and needs its own pull request to reach protected `main`. The version is
already decided at this point; spend it now.

**Then commit steps 2 and 3 together**, as one `docs(changelog): …` commit
carrying both the appended changelog bullets and the `packages/api` bump. Step 2
deliberately does not commit on its own: `npm version` in step 5 must find a
clean tree and produce a commit of exactly six files, so an uncommitted package
bump left over from here either dirties that commit or blocks it. If neither
step produced a change, there is no commit and step 4 follows directly.

### Step 4 — Audit the manual, before the version is spent

```bash
/docs-audit --in-place
```

The audit reads the branch as it stands and commits its corrections **onto it**,
with no worktree, no fix branch and no pull request. That placement is the whole
point: every correction is an ancestor of the tag step 5 is about to cut, for
free.

**It ran after the tag until 3.5.0, and that cost four fix-forward commits, four
re-tags and four full e2e matrix re-runs on one release branch.** None of them
needed the tag to exist — the audit reads `src/`, `docs/user/` and `messages/`,
all final at the end of step 3. Worse, the fix could never reach the root manual
from there: `pages.yml` builds the root from the **tag's tree**, and the audit
branched its fix from `origin/main`, so the correction landed on `/next/` only
however early it merged. Running before the tag retires both problems at once.

The audit stops the release in three ways, and **all three are worked now, on
this branch, before step 5**:

- **A wrong manual claim** is corrected by the audit itself. Nothing to do.
- **A wrong changelog bullet or shipped string** comes back as a maintainer
  question. A bullet the code contradicts is a defect, not a voice to preserve —
  correct the minimum, keeping the author's wording everywhere it is still true.
  A wrong `messages/*.json` string is an ordinary code fix; edit the file
  **line-wise**, never through a parse.
- **An uncovered feature** — something the release ships with no manual section
  explaining it — comes back the same way: write it now with `/docs-authoring`
  and commit it here, or record the maintainer's reason for ruling it out.

**Nothing is deferred past the tag.** A gap filed as an issue after the release
cannot reach the root manual at all, because the root is the tag's tree and the
tag has shipped; it waits for the next minor. 3.5.0's #483 is the worked example
— three features shipped, documented a day later, and live on `/next/` while the
root described 3.5.0 without them. The release waiting on prose is cheaper than
that, and it is the only thing that is.

A **regression** the maintainer chooses to fix forward is red — see "When
something goes red". The fix goes on this branch and step 4 runs again after it.

### Step 5 — Bump and tag

```bash
npm version "$VER" -m "chore: v%s"
```

One command: bumps `package.json` and `package-lock.json`, propagates the version
into `manifest.json`, `manifest-beta.json` and `versions.json`, promotes the
changelog heading, commits all six and creates the annotated tag.

Verify the commit programmatically rather than by eye:

```bash
git show --stat HEAD                                     # exactly six files
git show HEAD -- versions.json | grep -E '^[+-][^+-]'    # three lines, see below
git show HEAD -- CHANGELOG.md | grep -E '^[+-][^+-]'     # heading rewrite only
git tag --points-at HEAD                                 # the tag is here
```

`versions.json` must show exactly three lines: the previous last entry removed,
the same entry back with a comma, and `$VER` added. Anything else — an older
row's `minAppVersion` moving, a second new key — means back out.

```
-  "3.3.0": "1.8.7"
+  "3.3.0": "1.8.7",
+  "3.4.0": "1.8.7"
```

Do not count added lines instead. Appending an entry always rewrites the
preceding line to add its comma, so any "exactly one addition" check fails on
every release and teaches you to ignore your own verification.

Any disagreement means back out before anything is pushed. Back out the bump
**commit**, not the branch: by now it also carries step 3's changelog commit and
step 4's corrections, and `--hard origin/main` would discard both.

```bash
git tag -d "$VER" && git reset --hard HEAD~1
```

### Step 6 — Push, PR, and the gate

The `main` ruleset requires a pull request plus the `build` and `e2e-gate`
checks, and grants **no bypass — not even to the owner**. The release commits
cannot reach `main` directly.

```bash
git push -u origin "release/$VER"
git ls-remote --tags origin "$VER" | wc -l     # must print 0
gh pr create --title "chore: release $VER" --body "…"
gh pr checks <n> --watch --interval 30
```

The PR body says what is in the release, why it is minor or patch, whether
`src/settings/migrations.ts` moved, what `minAppVersion` is, and that the PR
must be merged with a merge commit. No `Co-Authored-By` trailer. No claude.ai
session links.

Because step 4 already ran, the manual corrections are in this PR and in this
gate run — one e2e matrix, not two.

### Step 7 — Merge with a merge commit

**Read the PR's comments before merging, not just the check list.** A bot review
posts findings while every check stays green. Feedback arrives in three places
and reading two of them is how a finding gets merged past:

```bash
gh api repos/srg-kostyrko/obsidian-journal/pulls/<n>/comments --jq '.[] | "\(.path):\(.line) \(.body)"'
gh api repos/srg-kostyrko/obsidian-journal/pulls/<n>/reviews  --jq '.[] | "\(.state): \(.body)"'
gh pr view <n> --json comments --jq '.comments[] | "[\(.author.login)] \(.body)"'
```

The middle one is the review **submission** — a change request, or a summary
that names findings the inline comments do not repeat.

```bash
gh pr merge <n> --merge
git switch main && git pull --ff-only
git merge-base --is-ancestor "$VER^{commit}" main   # must succeed
```

`--merge` is not a preference. Squash and rebase each rewrite the commit the tag
points at, leaving the tag dangling off `main`.

GitHub deletes the remote branch on merge, so only the local one is left —
`git branch -d "release/$VER"`. A `git push origin --delete` after that errors
with "remote ref does not exist"; that is the expected outcome, not a problem.

### Step 8 — Push the tag, after the branch has landed

`versions.json` is read from the default branch and the tag starts the build, so
the branch must reach GitHub first.

```bash
git push origin "$VER"
gh run list --workflow=release.yml --limit 3
gh run watch <id> --exit-status
```

`release.yml` re-runs the checks, builds, attests provenance, and opens a
**draft** release carrying `main.js`, `manifest.json` and `styles.css`.

Nothing about the manual is checked here. It was settled at step 4, and the tag
this push creates already carries it — which is exactly what `pages.yml` will
build the root from at step 9.

### Step 9 — Notes, then publish

The draft's body is empty. Fill it from the changelog section:

```bash
NOTES=<this session's scratchpad directory>/notes-$VER.md
node scripts/release-notes.mjs "$VER" > "$NOTES"
gh release edit "$VER" --notes-file "$NOTES"
gh release edit "$VER" --draft=false
```

The script strips the `## [x.y.z]` heading — the release is already titled with
its version — and trims the blanks and the generator comment at either end. Do
not hand-roll this with `awk`: that is what 3.5.0 did, and it published notes
that needed a stray blank line stripped after the fact. `check:changelog` now
gates the shape the script reads, so a loose list fails the `build` check rather
than reaching the notes.

Then deploy the manual. `pages.yml` has **no `release` trigger** — a `release` event's
run ref is the tag, and the `github-pages` environment allows only `main`, so such a
run is rejected before it executes a step and leaves a failed run with no step log.
Dispatching runs on `main`, satisfies the policy, and still resolves the root from the
release just published, so the root builds from the tag as it must:

The newest run is **not** necessarily this dispatch — a docs push to `main` triggers
this same workflow and can land between the two commands — so match on the event and on
a timestamp taken before dispatching rather than taking the first row:

```bash
SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run pages.yml --ref main
while :; do
  RUN=$(gh run list --workflow=pages.yml --event workflow_dispatch --limit 5 \
    --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$SINCE\")] | .[0].databaseId // empty")
  [ -n "$RUN" ] && break
  sleep 5
done
gh run watch "$RUN" --exit-status
```

Publish first: the job reads the latest **published** release, so a dispatch made while
the release is still a draft rebuilds the root from the _previous_ version.

### Step 10 — Verify it reached users

```bash
curl -sSL https://github.com/srg-kostyrko/obsidian-journal/releases/download/"$VER"/manifest.json
curl -sS  https://raw.githubusercontent.com/srg-kostyrko/obsidian-journal/main/versions.json | tail -3
gh release view "$VER" --json isDraft,assets --jq '{draft:.isDraft, assets:[.assets[].name]}'
```

The assets must be exactly `main.js`, `manifest.json` and `styles.css`, and the
manifest served from the release must carry `$VER`.

Check the manual's root too, since step 9's deploy is dispatched by hand and is the one
thing here that can simply be forgotten. Where the release changed a page — most do —
grep the live root for a sentence only this version carries, since the root is built
from the tag's tree and that is what proves it rebuilt. A release that changed no page
has no such phrase, and deploys byte-identical output, so there step 9's green
dispatched run is the whole of the evidence:

```bash
if git diff --quiet "$PREV".."$VER" -- docs/user; then
  echo "manual unchanged this release — step 9's green run is the check"
else
  curl -sS https://srg-kostyrko.github.io/obsidian-journal/<page> | grep -c '<a phrase $VER changed>'
fi
```

## §2 API package — conditional

Runs after §1 step 8's tag build is green. It may run before or after step 9
publishes the draft; §3 runs last, once the release is public.

Resuming straight into this section does **not** mean step 9 finished: its last act is
dispatching the manual deploy, which leaves no trace on the release itself. Check the
pages count from §0 before treating step 9 as done.

**`packages/api` does not ship on every plugin release.** Detect first:

```bash
PREV=$(git describe --tags --abbrev=0 "$VER^" 2>/dev/null || git describe --tags --abbrev=0)
test "$PREV" != "$VER" || { echo "refusing to compare the release against itself"; exit 1; }
git diff --quiet "$PREV"..HEAD -- src/api/public-api.ts && echo "unchanged → skip §2"
npm view obsidian-journals-api version   # what is already published
```

`PREV` is **the release before this one**, not `git describe --tags
--abbrev=0` on its own. By the time §2 runs from a resume, or from
`/release api`, the tag for `$VER` already exists at `HEAD` — a bare `describe`
then resolves to it, the diff compares `HEAD` with itself, and a changed surface
reads as unchanged. The guard above is what makes that fail loudly instead.

- **Unchanged** → skip this section entirely and do not touch
  `packages/api/package.json`.
- **Changed** → classify the diff before bumping anything. The additive-versus-
  breaking table in [`docs/plugin-api.md`](../../../docs/plugin-api.md) §Stability
  is the authority; do not restate it here.
  - Every change additive, `apiVersion` unmoved → **minor**.
  - `apiVersion` moved → **major**.
  - Anything breaking by that table while `apiVersion` did **not** move →
    **stop**. Nothing enforces that bump — `check:api` compiles a consumer and
    checks the package's declared dependencies, and says nothing about
    compatibility — so an unbumped breaking change reaches this point looking
    exactly like an additive one. That is a defect in the change, not a
    versioning call the release gets to make. Report it and let the maintainer
    decide whether to fix `apiVersion` or hold the package back.

Publish once the tag build is green. The constraint is simply that an npm
version number cannot be reused once published, so do not spend one until the
release build has proven the surface actually ships — that permits publishing
_before_ the draft release is published, which is worth doing when the notes link
to the package.

```bash
cd packages/api && npm publish --dry-run --access public
cd packages/api && npm publish --access public
```

`prepublishOnly` regenerates `index.d.ts` from `src/api/public-api.ts` and
refuses to publish if the committed file disagrees with its source.

**The npm OTP prompt is the maintainer's.** This is the one interactive stop in
the whole runbook.

**`+ package@version` in the publish output is the success signal — the registry
is not.** npm answers a successful publish with "Your package is being processed
and may take a few minutes to become available", and for those minutes both
`npm view` and a cache-bypassed fetch of the registry document keep serving the
previous version. A single read is therefore not evidence of anything. Poll until
it flips, and never report a publish as failed on a registry read when the
publish output said otherwise:

```bash
until [ "$(npm view obsidian-journals-api version)" = "<new>" ]; do sleep 30; done
```

**A 404 on publish is an auth failure, not a missing package.** npm masks auth
failures as `404 Not Found` on the publish endpoint so an unauthenticated caller
cannot probe which private package names exist. Diagnose it:

| Symptom                              | Cause                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npm whoami` → 401                   | Token expired or revoked. `npm_` granular tokens expire — 90 days by default. `npm login` is interactive; hand it over. |
| `npm whoami` succeeds, publish → 404 | The granular token's package scope does not cover `obsidian-journals-api`, or grants read without write.                |

The changelog bullet already names this version — §1 step 3 wrote it there, while
the release notes could still be edited. The package carries **no npm provenance
attestation** — `--provenance` needs CI's OIDC token — and that is deliberate:
the alternative is an automation token sitting in repository secrets.

## §3 Post-release

### Automatic

1. **Comment on every issue in the milestone**, saying the fix or feature shipped
   in `$VER`. Where the issue never recorded what actually shipped — a feature
   request that predates its own design, say — add that too, in the issue's own
   vocabulary rather than the implementation's.
2. **Close the issues the release fixed. Close the milestone.**

Step 1 is mechanical — the issue is the release's own and the content is "this
shipped". That is the whole of what posts unattended.

### Handed to the maintainer

3. **Cross-links into issues the release did not close.** The bar is that the
   release **fully solves** the issue — that it could be closed on the strength
   of this release alone. Partial overlap is not a cross-link: not a feature that
   "covers it indirectly", not a setting that "sidesteps" the bug, not a route
   that makes it "possible another way". **An empty set is a valid result**, and
   the common one.

   That bar is deliberately higher than it reads. At 3.5.0 the looser wording
   produced three drafts that all claimed coverage that did not exist — headless
   note creation (the REST API needs a running GUI Obsidian and a second plugin),
   URI capture (the request _is_ the URI), and recording a prompt answer from
   outside a note (the draft's own text said "unchanged by 3.5.0"). These are the
   maintainer's own scoping notes, so a false "covered" corrupts the next planning
   pass — a cost paid later, by someone reading the thread as settled.

   For the ones that clear it: draft one line per target naming the issue and the
   claim the comment would make, **including the near misses you rejected and
   why**, since a link not drawn is a judgment the maintainer never sees. Post
   only the ones they approve.

4. **The next milestone carries a theme.** It is a product decision — do not pick
   one. Read the open backlog and propose **two or three candidate themes**, each
   a short capability statement, with the issues that fit it and their demand.
   The maintainer picks one or names their own. Only then create the milestone,
   due **two weeks out**, and assign those issues.

   **Demand here is reactions from someone other than the maintainer, and the
   count of distinct non-maintainer participants — never the raw comment count.**
   This backlog is seeded by plugin harvesting, so the most-commented issues are
   typically the maintainer's own notes to themselves, and ranking by comments
   surfaces whatever they wrote up most recently. Age counts only once a second
   voice is on the thread.

5. **The Discord announcement** for the Obsidian community server. Write it to
   the scratchpad and hand it over — **never post it**.
   - **2000 characters, hard limit.** Count them.
   - Lead with the headline features, one short emoji-led block each, written for
     someone who has never read the changelog.
   - End with a **Coming next** section: a line per feature the new milestone's
     theme promises.
   - Put the release link in `<angle brackets>` so Discord does not expand it
     into an embed.

## Beta release

Beta is for **large or risky** changes only — a change big enough to be its own
project, or one that could damage a vault or break boot for everyone. An ordinary
fix or a small feature goes straight to stable; do not propose a beta round for
one.

1. Edit `manifest-beta.json` to the beta version, commit, push.
2. `gh workflow run release-beta.yml --ref <branch>`
3. Publish the draft pre-release, leaving the pre-release flag **on** — it is what
   keeps the build out of the pool for everyone who has not opted into betas.

Tag it `3.3.0-beta1`, never `3.3.0.beta1`; see Background for why. A stable bump
resets `manifest-beta.json` to the stable version, so set it deliberately each
time. The beta path has shipped nothing since the 2.0.1 series — treat it as
untested machinery.

## Never

- Never squash or rebase the release PR.
- Never push the tag before the branch has landed on `main`.
- Never rewrite an existing `[Unreleased]` bullet in step 2. Append only. The one
  exception is step 4's: a bullet the code contradicts is a defect, corrected with
  the maintainer's word and only where it is false.
- Never run `npm version` twice for one release — resume through §0 instead.
- Never commit with `--no-verify` or `core.hooksPath=/dev/null`.
- Never add a `Co-Authored-By` trailer, or a claude.ai session link, to a commit,
  PR body, or issue comment.
- Never change `minAppVersion` as part of a release.
- Never comment on an issue the release did not close without the maintainer's
  approval of that comment, and never draft one for an issue this release does not
  fully solve.
- Never post the Discord message.
- Never defer a manual gap, a wrong bullet or a wrong string past the tag. The
  published root is the tag's tree; there is no later.

## When something goes red

Stop. Report the failing output verbatim. Change nothing further — no retry, no
fix-and-continue; a fix is its own task with its own approval. Re-invoking the
skill resumes from §0, which works out what already happened.

A regression from step 4 that the maintainer chose to fix forward counts as red.

Recovering a bad bump before anything is pushed — back out the bump commit only,
not the branch, which by step 5 also carries the changelog commit and step 4's
corrections:

```bash
git tag -d "$VER" && git reset --hard HEAD~1
```

Abandoning the release outright is `git switch main && git branch -D "release/$VER"`
after deleting the tag. Because step 3 branched before anything was committed,
`main` is untouched and there is nothing to reset there.

After the branch is pushed, fix forward on the branch and
`git push --force-with-lease`. The tag stays local until step 8, so it can be
deleted and recreated freely up to that point.

## Background

Read-once context behind the steps above.

**The tag is the contract.** Obsidian matches a release to `manifest.json`'s
version by exact string equality: `3.0.0`, never `v3.0.0`. `.npmrc` pins
`tag-version-prefix=""` so `npm version` gets this right — leave it alone.

**Four files hold the version.** `package.json` is the one you bump;
`version-bump.mjs` (npm's `version` lifecycle script) writes the rest.
`versions.json` maps version → `minAppVersion` and is read from the default
branch, never uploaded as an asset — which is why the branch has to be pushed
before the tag.

**`version-bump.mjs`'s `writeJson` has to keep matching prettier exactly** — two
spaces **and** a trailing newline, which bare `JSON.stringify` does not emit.
JSON is in the nano-staged prettier glob, so restoring the Obsidian
sample-plugin `"\t"` convention there reopens a three-file diff that nano-staged
silently rewrites under the next commit.

**`compile:i18n` before `check:types`,** always. `src/i18n/paraglide` is
generated and git-ignored, so type-checking a fresh checkout fails without it.

**BRAT never fetches `manifest-beta.json`,** despite the name. Its
`validateRepository` hardcodes the filename in
`grabReleaseFileFromRepository(release, "manifest.json")`; the surviving
`getBetaManifest` parameter is passed straight through as `includePrereleases`.
So `manifest-beta.json` is only where the beta version is written down —
`release-beta.yml` reads it for the tag and attaches a **copy of it as the
release's `manifest.json`**, which is the file BRAT actually installs. A version
that disagrees with the tag gets the user a "Version mismatch detected" warning.

**BRAT installs the highest-versioned release, not the newest.** It sorts every
release by `semverCoerce(tag_name, { loose: true })` descending — falling back to
`published_at` only when a tag will not coerce — then takes the first entry that
survives `includePrereleases || !release.prerelease`. Adding a repo to BRAT
therefore does **not** pin it to the beta channel: prereleases join the same pool
as stable releases rather than outranking them.

**A beta tag must coerce above the current stable,** which the historical
`X.Y.Z.betaN` scheme does not. `semverCoerce("2.0.1.beta3")` yields plain
`2.0.1` — identical to the stable `2.0.1` release, so `compareVersions` returns 0
and the winner falls to an API-ordering tiebreak. `3.3.0-beta1` coerces to
`3.3.0` and sorts cleanly above `3.2.0`.

**Against [Obsidian's reference workflow](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions),**
this repo adds: checks before the build, `npm ci` over `npm install`, Node 24,
`attest-build-provenance@v2` in place of `attest@v4`, and build output in
`build/` rather than the repository root. Token permissions are granted per
workflow (`permissions: write-all`) instead of by raising the repository-wide
default, which stays at read.

**What the tag build does not gate.** `release.yml` runs only `check:types` and
`test` — not `coverage`, `check:lint`, `check:i18n` or `check:api`. `checks.yml`
does run on the tag push, but as a separate workflow that cannot stop the draft.
So nothing checked on the tag blocks a release; what actually gates one is the
release **PR**, where `build` and `e2e-gate` both have to be green before the
merge button unlocks. That is why step 7's merge must not be forced past a red
gate, and why step 1 mirrors `checks.yml` rather than `release.yml`.
