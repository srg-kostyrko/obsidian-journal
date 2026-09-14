---
name: docs-authoring
description: Use when writing or deepening a page of the user manual under docs/user/ — establishes which sources are authoritative, how claims are verified, and where worked examples and screenshots come from.
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

## Verifying claims

A page states behavior, and fluent prose about this plugin is wrong in ways that are
expensive to catch. Before a page is committed, an agent that did not write it checks
every claim against the code and marks each confirmed, wrong or unsupported; wrong
claims are fixed and unsupported ones are traced or deleted. The verdicts go into the
PR description, not into the page.

Pages carry no source citations. A correct path does not make a claim true, and a
refactor that moves a file would turn every citation of it into a false alarm or
silent rot.

## Worked examples

Every feature page ends with two or three concrete, copyable configurations.

- Transcribe the config from something that was **actually run** — an e2e fixture,
  or a vault you configured and observed. Never compose one from reading the schema.
  A composed config that looks valid and does not do what the page claims is the
  single most expensive thing this manual can ship.
- An example may instead cite an existing e2e spec that already asserts its outcome,
  with the config copied from that spec's fixture, rather than running a new one.
- Examples go inside the feature page they demonstrate. `docs/user/guides/` is a
  closed set of three; do not add a fourth.
- Run the example in a fixture vault through a `e2e/screenshots/<page>.shot.ts` spec, which
  records what actually happened in `e2e/.reports/outcomes/`. If the outcome disagrees with
  the page, the page changes.
- A fence meant to show a wrong option must use the `yaml` language: the unit suite parses
  every code-block fence in the manual and fails on an option the block would ignore.
- The fence test only sees fences the shared grammar recognizes: a fence indented four or
  more spaces, or one inside a blockquote, is not validated. Keep documented code-block
  fences at the left margin, or inside a `markdown` fence.

## Page conventions

- One `#` heading per page, matching the sidebar entry in `.vitepress/config.mts`.
- Document a warning, notice or error message only when its effect shows up somewhere other
  than where it appears — a settings warning whose consequence is that notes stop attaching —
  or when the page needs it to explain an outcome. The UI already shows the rest to the reader
  who meets them. Give each one a single home and link to it from elsewhere, and quote its text
  only when a reader would search for it. Nothing checks a quoted message against
  `messages/en.json`, so every extra quote goes stale on the next reword.
- A setting's or block's description text is not quoted — describe what it does in the page's own
  words, and only what its label does not already say; quote UI text only when the reader types or
  searches for it.
- A link to another page is a site-absolute path: `/decorations`, `/reference/variables`.
- Screenshots are generated, never captured by hand, and only where the outcome is seen.
  `npm run docs:screenshots` regenerates all of them; `npx wdio run ./wdio.conf.mts --spec
./e2e/screenshots/<page>.shot.ts` (after `npm run build`) regenerates one page's. Each
  subject is captured in both Obsidian themes and embedded as a pair, named
  `<page>-<subject>-light.png` / `-dark.png`, where `<page>` is the page's file name
  without `.md`:

  ```markdown
  ![Month calendar in the sidebar](/assets/views-month-light.png){.light-only}
  ![Month calendar in the sidebar](/assets/views-month-dark.png){.dark-only}
  ```

- Open every captured PNG before committing it. A capture can crop the wrong frame — the
  workspace chrome, or another block — and the spec still passes.

- A new page must be added to `sidebar` in `.vitepress/config.mts`, or it is unreachable.

## `{{...}}` in prose

VitePress compiles every page as a Vue template, so a literal `{{...}}` in prose —
including inside inline backticks — is evaluated as a Vue expression. Fenced code
blocks are exempt. The manual quotes template variables like `{{date}}`
constantly, so this will come up on most pages.

The consequence depends on the contents, and the build is not a reliable
gate: a plain variable name like `{{date}}` silently renders as blank text and
the build still passes; a variable with modifiers, like `{{date+5d:format}}`
or `{{index:o}}`, usually fails the build with a syntax error. Neither
`npm run docs:build` nor `npm run check:docs-links` catches a forgotten wrap
around a plain variable name — `npm run check:docs-mustaches` does — so wrap
every `{{...}}` outside a fenced block, don't rely on the build to tell you.

Wrap the affected content in a `::: v-pre` container: the opening and closing
lines at column 0, nothing else on them. This container form is what
`check:docs-mustaches` recognises as protection; an inline `<span v-pre>` is not.

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

Run, in order:

1. `npm run check:docs-mustaches` — catches an unwrapped `{{...}}`.
2. `npm run docs:build` — catches a link to a page that does not exist.
3. `npm run check:docs-links` — catches a link to an anchor that does not exist.
4. The claim review described under **Verifying claims**.
