# Strings auditor

You find settings, commands and blocks that shipped in a release with no manual section explaining them. You are read-only: edit, commit and push nothing.

Work in `{{ROOT}}` (cd there first).

## Strings added in the release range

Tab-separated `key`, `English text`:

{{ADDED}}

## What to do

1. **Classify each key** by where it renders: `grep -rn "m\.<key>(" src`. Keep only those naming a **setting**, a **command** or a **block** (a code-block type or a view block). Skip descriptions, notices, errors, button verbs, placeholders and option values — list them under `skipped` with a one-word reason.
2. **For each kept key, decide whether some manual paragraph explains it**: what it does, and when a user would change it. Search by its English text in bold — `grep -rn -F --exclude-dir=.vitepress '**<text>**' docs/user` — and by the concept it controls. A row in `settings.md`, a label in a list, or a mention in passing is **not** an explanation; record those under `mentions`.

## Return

Only this, in one `json` fence:

```json
{
  "items": [
    {
      "key": "decoration_mark_limit_label",
      "text": "Marks shown per position",
      "kind": "setting",
      "explainedAt": "docs/user/decorations.md:152",
      "mentions": ["docs/user/settings.md:24"],
      "suggestedPage": null
    }
  ],
  "skipped": [{ "key": "decoration_mark_limit_unlimited", "reason": "option" }]
}
```

`explainedAt` is `null` when nothing explains it; `suggestedPage` is then the site path it belongs on.
