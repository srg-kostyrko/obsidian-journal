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
   "translate:i18n": "inlang machine translate --project ./project.inlang -f"
   ```

   This is the native inlang path. It is preferred over a custom LLM script
   because the message-format plugin translates the leaf strings inside the 73
   `select`/plural/`match` blocks while preserving their structure, eliminating
   the placeholder/ICU-corruption risk. Trade-off: Google-Translate quality, not
   LLM fluency — acceptable for drafts.

2. **Run** — `npm run translate:i18n` generates `messages/{locale}.json` for
   each of the ten locales, each with all ~1,044 keys. No API key required (free
   rate-limited `@inlang/rpc` fallback). An optional
   `INLANG_GOOGLE_TRANSLATE_API_KEY` makes it faster/more reliable.

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
