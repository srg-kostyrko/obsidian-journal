---
name: release
description: Use when cutting a Journals release — bumping the plugin to a new version, shipping a beta build, publishing the obsidian-journals-api npm package, or picking up a release that stopped part-way.
---

# Releasing Journals

Maintainer runbook, executed rather than read. It covers the whole arc: gates,
changelog audit, bump, tag, draft, publish, npm package, then the issue-tracker
and community work that follows a release.

**Invoking this skill is the authorization for every outward step below** —
pushing a branch, merging the release PR, pushing the tag, publishing the
release, publishing to npm. Do not stop to ask permission for those again.

Two things are never done unattended, because both go out in the maintainer's
own voice: the **next milestone's theme** and the **Discord announcement**.
Draft them, hand them over, and let the maintainer act.

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
```

| Observed                             | Resume at                  |
| ------------------------------------ | -------------------------- |
| Nothing exists                       | §1 step 1                  |
| Manifest bumped, no branch on remote | §1 step 5                  |
| Branch pushed, PR open               | §1 step 5 (wait on checks) |
| PR merged, tag not on remote         | §1 step 7                  |
| Tag pushed, release still a draft    | §1 step 8                  |
| Release published, npm behind        | §2                         |
| Everything shipped                   | §3                         |

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
gh issue list --milestone "$VER" --state closed --json number,title
```

Walk every `feat`/`fix` commit and every closed milestone issue, and check
whether `[Unreleased]` already covers it. Gaps happen — a PR that forgot its
entry, or a surface that grew after the entry was written. **Append** the missing
bullets under the existing `### Features` / `### Bug Fixes` headings, matching
the surrounding bullets' voice: what changed for the person using the plugin,
sentence case, no scopes, no commit hashes, the issue's own vocabulary.

Leave the `## [Unreleased]` heading itself alone — `version-bump.mjs` promotes
it in step 4. Run `npx prettier --write CHANGELOG.md`; prettier owns the file's
shape. Commit the gaps on their own, as `docs(changelog): …`, **before** the
bump, so the bump commit carries only the promotion.

If the audit finds nothing missing, say so and move on — an empty audit is a
result, not a reason to write something.

### Step 3 — API package bump, only if the surface moved

See §2 for the detection and the rule. If it fires, the version bump in
`packages/api/package.json` rides along with the step 2 commit. If it does not,
leave that file alone entirely.

### Step 4 — Bump and tag

```bash
npm version "$VER" -m "chore: v%s"
```

One command: bumps `package.json` and `package-lock.json`, propagates the version
into `manifest.json`, `manifest-beta.json` and `versions.json`, promotes the
changelog heading, commits all six and creates the annotated tag.

Verify the commit programmatically rather than by eye:

```bash
git show --stat HEAD                                     # exactly six files
git show HEAD -- versions.json | grep -c '^+[^+]'        # exactly 1
git show HEAD -- CHANGELOG.md | grep -E '^[+-][^+-]'     # heading rewrite only
git tag --points-at HEAD                                 # the tag is here
```

Any disagreement means back out before anything is pushed:

```bash
git tag -d "$VER" && git reset --hard origin/main
```

### Step 5 — Branch, PR, and the gate

The `main` ruleset requires a pull request plus the `build` and `e2e-gate`
checks, and grants **no bypass — not even to the owner**. The release commits
cannot reach `main` directly.

```bash
git switch -c "release/$VER"
git push -u origin "release/$VER"
git ls-remote --tags origin "$VER" | wc -l     # must print 0
gh pr create --title "chore: release $VER" --body "…"
gh pr checks <n> --watch --interval 30
```

The PR body says what is in the release, why it is minor or patch, whether
`src/settings/migrations.ts` moved, what `minAppVersion` is, and that the PR
must be merged with a merge commit. No `Co-Authored-By` trailer. No claude.ai
session links.

### Step 6 — Merge with a merge commit

```bash
gh pr merge <n> --merge
git switch main && git pull --ff-only
git merge-base --is-ancestor "$VER^{commit}" main   # must succeed
```

`--merge` is not a preference. Squash and rebase each rewrite the commit the tag
points at, leaving the tag dangling off `main`.

### Step 7 — Push the tag, after the branch has landed

`versions.json` is read from the default branch and the tag starts the build, so
the branch must reach GitHub first.

```bash
git push origin "$VER"
gh run list --workflow=release.yml --limit 3
gh run watch <id> --exit-status
```

`release.yml` re-runs the checks, builds, attests provenance, and opens a
**draft** release carrying `main.js`, `manifest.json` and `styles.css`.

### Step 8 — Notes, then publish

The draft's body is empty. Fill it from the changelog section, **stripping the
`## [x.y.z]` heading** — the release is already titled with its version.

```bash
gh release edit "$VER" --notes-file <extracted-section>
gh release edit "$VER" --draft=false
```

### Step 9 — Verify it reached users

```bash
curl -sSL https://github.com/srg-kostyrko/obsidian-journal/releases/download/"$VER"/manifest.json
curl -sS  https://raw.githubusercontent.com/srg-kostyrko/obsidian-journal/main/versions.json | tail -3
gh release view "$VER" --json isDraft,assets --jq '{draft:.isDraft, assets:[.assets[].name]}'
```

The assets must be exactly `main.js`, `manifest.json` and `styles.css`, and the
manifest served from the release must carry `$VER`.

## §2 API package — conditional

Runs after §1 step 7's tag build is green. It may run before or after step 8
publishes the draft; §3 runs last, once the release is public.

**`packages/api` does not ship on every plugin release.** Detect first:

```bash
LAST=$(git describe --tags --abbrev=0)
git diff --quiet "$LAST"..HEAD -- src/api/public-api.ts && echo "unchanged → skip §2"
npm view obsidian-journals-api version   # what is already published
```

- **Unchanged** → skip this section entirely and do not touch
  `packages/api/package.json`.
- **Changed** → bump it. **Major** only when `apiVersion` in
  `src/api/public-api.ts` moved; otherwise **minor**, since every addition is
  additive.

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

**A 404 on publish is an auth failure, not a missing package.** npm masks auth
failures as `404 Not Found` on the publish endpoint so an unauthenticated caller
cannot probe which private package names exist. Diagnose it:

| Symptom                              | Cause                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `npm whoami` → 401                   | Token expired or revoked. `npm_` granular tokens expire — 90 days by default. `npm login` is interactive; hand it over. |
| `npm whoami` succeeds, publish → 404 | The granular token's package scope does not cover `obsidian-journals-api`, or grants read without write.                |

Record the published version in `CHANGELOG.md` under the plugin version that
shipped the surface. The package carries **no npm provenance attestation** —
`--provenance` needs CI's OIDC token — and that is deliberate: the alternative is
an automation token sitting in repository secrets.

## §3 Post-release

### Automatic

1. **Comment on every issue in the milestone**, saying the fix or feature shipped
   in `$VER`. Where the issue never recorded what actually shipped — a feature
   request that predates its own design, say — add that too, in the issue's own
   vocabulary rather than the implementation's.
2. **Close the issues the release fixed. Close the milestone.**
3. **Cross-link adjacent issues** the release answers indirectly: an open request
   the new feature covers gets a comment pointing at it and stating plainly what
   is, and is not, planned.

### Handed to the maintainer

4. **The next milestone carries a theme.** It is a product decision — do not pick
   one. Read the open backlog and propose **two or three candidate themes**, each
   a short capability statement, with the issues that fit it and their demand
   (reactions, comments, age). The maintainer picks one or names their own. Only
   then create the milestone, due **two weeks out**, and assign those issues.

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
- Never rewrite an existing `[Unreleased]` bullet. Append only.
- Never run `npm version` twice for one release — resume through §0 instead.
- Never commit with `--no-verify` or `core.hooksPath=/dev/null`.
- Never add a `Co-Authored-By` trailer, or a claude.ai session link, to a commit,
  PR body, or issue comment.
- Never change `minAppVersion` as part of a release.
- Never post the Discord message.

## When something goes red

Stop. Report the failing output verbatim. Change nothing further — no retry, no
fix-and-continue; a fix is its own task with its own approval. Re-invoking the
skill resumes from §0, which works out what already happened.

Recovering a bad bump before anything is pushed:

```bash
git tag -d "$VER" && git reset --hard origin/main
```

After the branch is pushed, fix forward on the branch and
`git push --force-with-lease`. The tag stays local until step 7, so it can be
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
merge button unlocks. That is why step 6's merge must not be forced past a red
gate, and why step 1 mirrors `checks.yml` rather than `release.yml`.
