# i18n glossary

`npm run translate:i18n` machine-translates the non-English locales through
`@inlang/cli machine translate`. That CLI has **no glossary option** — it sees one
message string at a time with no domain context, so it is free to re-render the
plugin's core nouns however it likes on every run, and it has: `note` has come back
as a banknote, a promissory note, an accounting entry and a musical note; `journal`
as a magazine, a periodical and an accounting ledger.

`npm run check:i18n` (`scripts/check-i18n-glossary.mjs`) enforces the table below and
runs in CI. Adding a locale or a new domain noun means extending `GLOSSARY` there.

## Canonical terms

| en          | de      | es      | fr      | it        | ja         | ko   | pt         | ru      | uk      | zh   |
| ----------- | ------- | ------- | ------- | --------- | ---------- | ---- | ---------- | ------- | ------- | ---- |
| **journal** | Journal | diario  | journal | diario    | ジャーナル | 저널 | diário     | журнал  | журнал  | 日记 |
| **note**    | Notiz   | nota    | note    | nota      | ノート     | 노트 | nota       | заметка | нотатка | 笔记 |
| **shelf**   | Regal   | estante | étagère | scaffale  | 棚         | 선반 | prateleira | полка   | полиця  | 书架 |
| **bold**    | Fett    | negrita | gras    | grassetto | 太字       | 굵게 | negrito    | жирный  | жирний  | 粗体 |

Grammatical gender, where it decides agreement: `Journal` n. / `Notiz` f. / `Regal` n.
(de) · `diario` m. / `nota` f. / `estante` m. (es) · `journal` m. / `note` f. /
`étagère` f. (fr) · `diario` m. / `nota` f. / `scaffale` m. (it) · `diário` m. /
`nota` f. / `prateleira` f. (pt) · `журнал` m. / `заметка` f. / `полка` f. (ru) ·
`журнал` m. / `нотатка` f. / `полиця` f. (uk).

## Notes on the picks

- **ja/ko `note`.** Both locales had a near-even split with メモ / 메모 ("memo",
  "sticky note"). ノート / 노트 is what Obsidian's own ja/ko UI calls a vault note.
- **zh `journal`.** The corpus was a three-way split between 日志 (a software log),
  期刊 (a periodical) and 日记. 日记 is the diary sense the plugin actually means.
  **日志 is still correct for the logging feature** — the checker allows it under
  `logging_*` keys and nowhere else.
- **`bold`.** Not a domain noun, but it failed the same way: eight of ten locales read
  it as the courage adjective rather than the typographic weight (de "Deutlich", es
  "Atrevido", fr "Audacieux", pt "Audacioso", ru "Смелый", ja 大胆な, ko 용감한, zh
  大胆的). It is in the table because the nav-row style control labels the button with
  a bare `B` glyph, so this string is the only name the control has.

## What the checker does not catch

It bans wrong _terms_; it cannot see wrong _grammar_. Three known classes remain in the
corpus, all from the same context-free-MT root cause:

- **Part-of-speech misparse.** `bulk_add_filter_combinator_label` is the imperative
  "Filter notes", and seven of ten locales rendered it as the noun phrase "notes about
  filters" (de "Filternotizen", ru "Примечания к фильтру", zh "注释"). Fixed here, but
  nothing prevents the next one.
- **Register drift inside a single match block.** `command_type_label` mixes
  imperative and participial forms across its variants in es and fr ("Nota mensual
  abierta" beside "Abrir nota trimestral actual"). Only the variants touched by the
  glossary pass were normalized; the rest still diverge.
- **Period nouns spliced in as `{unit}`.** A message like "Previous {unit}" survives
  MT unchanged and then renders the raw enum in every locale ("Vorherige week"), and
  even once translated the adjective cannot agree with the noun it precedes. Period
  and level nouns therefore never travel as a parameter: the message takes the period
  as a _selector_ and each variant spells the whole phrase, the way
  `relative_date_this` and `view_toolbar_button_default_tooltip_prev_unit` do. Where
  two dropdowns are read as one phrase, the adjective-only message selects on the
  neighboring unit too (`view_toolbar_button_config_direction_option`), which is a
  no-op `unit=*` pair in locales without gender agreement.
