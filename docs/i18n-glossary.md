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

| en          | de      | es      | fr      | it       | ja         | ko   | pt         | ru      | uk      | zh   |
| ----------- | ------- | ------- | ------- | -------- | ---------- | ---- | ---------- | ------- | ------- | ---- |
| **journal** | Journal | diario  | journal | diario   | ジャーナル | 저널 | diário     | журнал  | журнал  | 日记 |
| **note**    | Notiz   | nota    | note    | nota     | ノート     | 노트 | nota       | заметка | нотатка | 笔记 |
| **shelf**   | Regal   | estante | étagère | scaffale | 棚         | 선반 | prateleira | полка   | полиця  | 书架 |

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

## What the checker does not catch

It bans wrong _terms_; it cannot see wrong _grammar_. Two known classes remain in the
corpus, both from the same context-free-MT root cause:

- **Part-of-speech misparse.** `bulk_add_filter_combinator_label` is the imperative
  "Filter notes", and seven of ten locales rendered it as the noun phrase "notes about
  filters" (de "Filternotizen", ru "Примечания к фильтру", zh "注释"). Fixed here, but
  nothing prevents the next one.
- **Register drift inside a single match block.** `command_type_label` mixes
  imperative and participial forms across its variants in es and fr ("Nota mensual
  abierta" beside "Abrir nota trimestral actual"). Only the variants touched by the
  glossary pass were normalized; the rest still diverge.
