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

**2. Changelog.** Run `/changelog <x.y.z>`, edit the draft, promote
`## [Unreleased]` to `## [<x.y.z>] - YYYY-MM-DD`, and commit it on its own.

**3. Bump and tag.**

```bash
npm version <x.y.z> -m "chore: v%s"
```

One command: bumps `package.json`, propagates the version into `manifest.json`,
`manifest-beta.json`, and `versions.json`, commits all four, and creates the
annotated tag `<x.y.z>`. Read the commit before pushing — four files changed,
`versions.json` up exactly one line.

**4. Push.** Branch before tag; the tag starts the build.

```bash
git push origin main
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
