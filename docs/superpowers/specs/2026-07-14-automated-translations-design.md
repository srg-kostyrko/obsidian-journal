# Automated translations for tier 1 + tier 2 locales

## Goal

Configure an automated, repeatable machine-translation pipeline and use it to
populate tier 1 + tier 2 locales as **unreviewed drafts**. Shipping "the
language is offered", not "the language is good" — a human/native review pass is
still owed per locale before the content is trusted.

## Locale set

Ten locales, all **lowercase base codes** (no region suffix):

- Tier 1: `zh`, `de`, `fr`, `ru`
- Tier 2: `es`, `pt`, `ja`, `ko`, `it`, `uk`

Base codes are required because `matchLocale` lowercases Obsidian's
`getLanguage()` output but compares it against `locales` as-registered. A
mixed-case entry like `pt-BR` would never match and would silently fall back to
English. Using `pt` also lets the region→prefix fallback cover both `pt` and
`pt-BR` Obsidian users with one file. `zh` = Simplified Chinese.

## Pipeline

1. **Configure** — add the ten locales to `locales` in
   `project.inlang/settings.json`. Add a `package.json` script:

   ```
   "translate:i18n": "npx --yes @inlang/cli machine translate --project ./project.inlang && node scripts/fix-i18n-variant-keys.mjs"
   ```

   This is the native inlang path. It is preferred over a custom LLM script
   because the message-format plugin translates the leaf strings inside the
   multi-selector `match` blocks while preserving their structure, eliminating
   the placeholder/ICU-corruption risk. Trade-off: Google-Translate quality, not
   LLM fluency — acceptable for drafts.

   The `&& node scripts/fix-i18n-variant-keys.mjs` step is required: the CLI
   (v3.1.15) re-serializes multi-selector match keys with a space after each
   comma (`type=a, writeType=b`). Paraglide parses selector names by splitting
   those keys on `,` without trimming, so the spaces leak into the generated
   input parameter names and break `check:types`. The normalizer strips them.

2. **Run** — `npm run translate:i18n` generates `messages/{locale}.json` for
   each of the ten locales, each with the full base key set. Requires a Google
   Cloud Translation API key exported as `INLANG_GOOGLE_TRANSLATE_API_KEY` — the
   installed CLI (v3.1.15) has no keyless `@inlang/rpc` fallback. The job is
   ~316K characters, under Google's permanent 500K-characters/month free tier,
   so a one-time run costs nothing (a billing account must still be attached to
   the Cloud project). The CLI also re-serializes `messages/en.json`; because en
   is the hand-authored source, restore it (`git checkout HEAD -- messages/en.json`)
   after a run — its values are never translated.

3. **Compile** — `npm run compile:i18n` regenerates paraglide output under
   `src/i18n/paraglide` (git-ignored, never staged).

## Runtime wiring

No code changes. `main.ts` already calls `initLocale(getLanguage())`;
`matchLocale` maps the app language against the registered `locales` with a
region→prefix fallback and falls back to `en`. Registering the locales +
compiling is sufficient for automatic language switching.

## Quality gates

- `check:types` is the real structural gate: paraglide type-checks every locale
  against the base message signatures, so a missing key or broken placeholder
  fails the build.
- `test` and `check:lint` also run.
- No new e2e: there are no runtime code changes, and asserting machine-translated
  strings would be tautological. The existing `en` suite plus `check:types`
  cover it.

## Error handling / caveats

- The pipeline is idempotent: a re-run fills only still-missing keys, so RPC
  throttling mid-run is recoverable. If any locale comes back incomplete, report
  it rather than claim completion.
- Content is unreviewed machine draft; committed as such.

## Commit

To the current `v3-ai` branch. Do not stage the generated `src/i18n/paraglide`
output.
