# Releasing

Maintainer runbook. Steps first; the background at the bottom is read-once.

## Stable release

**1. Gates.** Clean checkout of the commit you intend to tag:

```bash
npm ci && npm run compile:i18n
npm run check:types && npm test && npm run check:lint && npm run check:i18n
```

Then e2e, which no CI job runs on a tag:

```bash
npm run test:e2e:smoke
npm run test:e2e:integration
npm run test:e2e:migration
npm run test:e2e:interop
npx wdio run ./wdio.conf.mts --suite journeys
```

**2. Changelog.** Run `/changelog <x.y.z>` and edit the draft under
`## [Unreleased]`. Leave the heading alone — `version-bump.mjs` promotes it to
`## [<x.y.z>] - YYYY-MM-DD` in step 3. Commit any edits to the notes themselves
first, so the bump commit carries only the promotion.

**3. Bump and tag.**

```bash
npm version <x.y.z> -m "chore: v%s"
```

One command: bumps `package.json` and `package-lock.json`, propagates the
version into `manifest.json`, `manifest-beta.json`, and `versions.json`,
promotes the changelog's `## [Unreleased]` heading, commits all six, and creates
the annotated tag `<x.y.z>`. Read the commit before pushing — six files changed,
`versions.json` up exactly one line, and `CHANGELOG.md` showing only the heading
rewrite. The changelog step is a no-op if a `## [<x.y.z>]` section already
exists, so promoting by hand first is still safe.

**4. Push.** The `main` ruleset requires a pull request and the `build` and
`e2e-gate` checks, and grants **no bypass — not even to the owner**, so the two
release commits cannot be pushed to `main` directly. Put them on a branch and
merge the PR:

```bash
git switch -c release/<x.y.z>
git push -u origin release/<x.y.z>
gh pr create --fill && gh pr merge --merge
```

Merge, never squash or rebase: both rewrite the commit the tag points at,
leaving it dangling off `main`. Only then push the tag, which must reach GitHub
**after** the branch — `versions.json` is read from the default branch, and the
tag starts the build.

```bash
git switch main && git pull
git push origin <x.y.z>
```

**5. Publish.** The tag triggers `release.yml`, which re-runs the checks, builds,
attests provenance, and opens a **draft** release with `main.js`,
`manifest.json`, and `styles.css`. When it goes green: Releases → edit the draft
→ paste the changelog section as the notes → Publish. Nothing reaches users
before that click.

## Beta release

**1.** Edit `manifest-beta.json` to the beta version, commit, push.

**2.** Actions → **Release Obsidian plugin (beta)** → Run workflow, from the
branch you want built.

**3.** Publish the draft pre-release the same way.

Leave the pre-release flag on: it is the only thing BRAT uses to find a beta.

## Background

**The tag is the contract.** Obsidian matches a release to `manifest.json`'s
version by exact string equality: `3.0.0`, never `v3.0.0`. `.npmrc` pins
`tag-version-prefix=""` so `npm version` gets this right — leave it alone.

**Four files hold the version.** `package.json` is the one you bump;
`version-bump.mjs` (npm's `version` lifecycle script) writes the rest.
`versions.json` maps version → `minAppVersion` and is read from the default
branch, never uploaded as an asset — which is why the branch has to be pushed
before the tag.

**`minAppVersion` is a manual edit,** and raising it also raises the floor of
the e2e matrix: `wdio.conf.mts` resolves its `earliest` spec from it.

**`compile:i18n` before `check:types`,** always. `src/i18n/paraglide` is
generated and git-ignored, so type-checking a fresh checkout fails without it.

**BRAT ignores `manifest-beta.json`.** It picks the newest release flagged
`prerelease` and installs the `manifest.json` attached to it; a version that
disagrees with the tag gets the user a "Version mismatch detected" warning.
`manifest-beta.json` is just where the beta version is written down —
`release-beta.yml` reads it for the tag and attaches a copy of it as the
release's `manifest.json`. A stable bump resets it to the stable version, so
set it deliberately each time.

**Against [Obsidian's reference workflow](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions),**
this repo adds: checks before the build, `npm ci` over `npm install`, Node 24,
`attest-build-provenance@v2` in place of `attest@v4`, and build output in
`build/` rather than the repository root. Token permissions are granted per
workflow (`permissions: write-all`) instead of by raising the repository-wide
default, which stays at read.

**What CI does not gate.** `release.yml` runs only `check:types` and `test`;
`check:lint`, `check:i18n`, and the whole e2e layer are manual (step 1).
`checks.yml` does run on the tag push, but in a separate workflow that cannot
stop the draft. And the beta path has not shipped anything since the 2.0.1
series — treat the first v3 beta as untested machinery.

## API package release

`packages/api` (`obsidian-journals-api`) is published from your machine — no
workflow, no `NPM_TOKEN`.

**1. The plugin stable release completes first.** The published types describe a
surface users must already have; publishing ahead of it hands integrators a
compile-clean call against an API nobody is running.

**2. Bump `packages/api/package.json`.** Major only when `apiVersion` moves in
`src/api/public-api.ts`; minor for additions.

**3. Publish.**

```bash
cd packages/api && npm publish --access public
```

`prepublishOnly` regenerates `index.d.ts` from `src/api/public-api.ts` and
refuses to publish if the committed file disagrees with its source.

**4. Record it in `CHANGELOG.md`** under the plugin version that shipped the
surface.

Publishing locally means the package carries **no npm provenance attestation**
(`--provenance` needs CI's OIDC token, unlike the plugin's build artifacts), and
that your npm 2FA prompt applies. Both are deliberate: the alternative is an
automation token sitting in repository secrets.
