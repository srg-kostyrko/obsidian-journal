---
name: docs-authoring
description: Use when writing or deepening a page of the user manual under docs/user/ — establishes which sources are authoritative, the citation rule, and where worked examples may live.
---

# Writing a user manual page

The manual is at `docs/user/`, published at srg-kostyrko.github.io/obsidian-journal.
Pages are named for domain concepts, never for settings tabs.

## Sources, in order of authority

| Source                             | Authority for                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/`                             | behavior — what actually happens                                                                  |
| `messages/en.json`                 | the exact UI wording. Quote labels verbatim; never paraphrase a label the user can read on screen |
| `src/**/settings/ui/*.vue`         | which settings rows exist, and in what order                                                      |
| `CONTEXT.md`                       | domain vocabulary — periods, journals, shelves, decorations                                       |
| `docs/2026-07-13-ux-text-audit.md` | copy style — sentence case, en-US, error grammar                                                  |

Never source a claim from `README.md`. It is an overview and is deliberately brief;
paraphrasing it produces the shallow content this manual exists to replace.

## The citation rule

Every behavioral claim carries an HTML comment naming the file it was verified in:

```markdown
A weekly journal anchors to the week's first day under the installed week grid.
<!-- src: src/journals/settings/week-preset-service.ts -->
```

File only, never line numbers — they rot on every unrelated edit and generate
false alarms. The comment is invisible when rendered and survives prettier.

This is not decoration. It is what makes review cheap ("is this citation real"
rather than "does this sound right"), and it is the index the docs-audit skill
uses to find paragraphs whose justification has moved.

## Worked examples

Every feature page ends with two or three concrete, copyable configurations.

- Transcribe the config from something that was **actually run** — an e2e fixture,
  or a vault you configured and observed. Never compose one from reading the schema.
  A composed config that looks valid and does not do what the page claims is the
  single most expensive thing this manual can ship.
- Examples go inside the feature page they demonstrate. `docs/user/guides/` is a
  closed set of three; do not add a fourth.

## Page conventions

- One `#` heading per page, matching the sidebar entry in `.vitepress/config.mts`.
- A link to another page is a site-absolute path: `/decorations`, `/reference/variables`.
- Screenshots live in `docs/user/public/assets/` and are referenced as `/assets/<name>.png`.
- A new page must be added to `sidebar` in `.vitepress/config.mts`, or it is unreachable.

## `{{...}}` in prose

VitePress compiles every page as a Vue template, so a literal `{{...}}` in prose —
including inside inline backticks — is parsed as a Vue expression and fails the
build. The manual quotes template variables like `{{date}}` constantly, so this
will come up on most pages. Fenced code blocks are exempt.

Wrap the affected content in a `::: v-pre` container: the opening and closing
lines at column 0, nothing else on them.

```markdown
::: v-pre

The `{{date}}` variable expands to the note's own date.

:::
```

`docs/user/journals.md` is a live instance. The container changes nothing
visible, and the `llms-full.txt` generator (`docs/user/.vitepress/llms.mts`)
strips its two marker lines from the output — and fails the build on a
`::: v-pre` that is never closed.

## Before you finish

Run `npm run docs:build`, then `npm run check:docs-links`. The build catches a
link to a page that does not exist; the link checker catches a link to an
anchor that does not exist.
