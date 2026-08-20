# i18n glossary

Translations are **hand-authored**. There is no machine-translation step: the
`translate:i18n` script and its `fix-i18n-variant-keys.mjs` fixup were removed once it
became clear what the pipeline actually cost.

`@inlang/cli machine translate` had no glossary option. It saw one message string at a
time with no domain context, so it re-rendered the plugin's nouns however it liked on
every run, and it could not be told not to. What it shipped, in production, in every
locale:

| en             | what shipped                                                              |
| -------------- | ------------------------------------------------------------------------- |
| Logging        | uk "Лісозаготівля", ko "벌채 반출", es "Explotación florestal" — forestry |
| Period buttons | ja "生理用ボタン" (menstrual products), fr "Boutons de ponctuation"       |
| Condition      | pt "Doença" (disease), uk "Хвороба" (illness)                             |
| A property     | ru "Объект недвижимости", ja 不動産, zh 房产 — real estate                |
| Keep notes     | _take notes_ — in all ten locales                                         |
| Run            | _to run on foot_ — in all ten locales                                     |
| Place journal  | uk "Журнал місць" (journal of places), fr "Journal de bord" (logbook)     |
| Startup        | zh "创业公司" (a startup company), uk "Стартап"                           |

These were not edge cases; they were the default output for any word with a second
sense. Fixing them by hand and re-running the pipeline would have reintroduced them, so
the pipeline is gone.

What is banned is the **context-free** pipeline, not every non-native translator. The
failures above all trace to one string at a time with no domain context; a translator —
person or agent — that reads this file, reuses the canonical terms, and matches the
register of the neighbouring keys is working with exactly the context the pipeline
lacked. Say which kind of pass a locale has had under "Coverage" below, and never
re-run a bulk translator over the corpus.

`npm run check:i18n` (`scripts/check-i18n-glossary.mjs`) runs in CI and enforces
everything below. Adding a locale or a new domain noun means extending it there.

## Canonical terms

| en              | de          | es            | fr          | it           | ja               | ko         | pt           | ru            | uk             | zh          |
| --------------- | ----------- | ------------- | ----------- | ------------ | ---------------- | ---------- | ------------ | ------------- | -------------- | ----------- |
| **journal**     | Journal     | diario        | journal     | diario       | ジャーナル       | 저널       | diário       | журнал        | журнал         | 日记        |
| **note**        | Notiz       | nota          | note        | nota         | ノート           | 노트       | nota         | заметка       | нотатка        | 笔记        |
| **shelf**       | Regal       | estante       | étagère     | scaffale     | 棚               | 선반       | prateleira   | полка         | полиця         | 书架        |
| **view**        | Ansicht     | vista         | vue         | vista        | ビュー           | 뷰         | visualização | представление | представлення  | 视图        |
| **decoration**  | Dekoration  | decoración    | décoration  | decorazione  | 装飾             | 장식       | decoração    | оформление    | оформлення     | 装饰        |
| **vault**       | Vault       | bóveda        | coffre-fort | vault        | 保管庫           | 보관함     | cofre        | хранилище     | сховище        | 库          |
| **frontmatter** | Frontmatter | Frontmatter   | Frontmatter | Frontmatter  | フロントマター   | 프런트매터 | Frontmatter  | Frontmatter   | Фронтматер     | Frontmatter |
| **property**    | Eigenschaft | propiedad     | propriété   | proprietà    | プロパティ       | 속성       | propriedade  | свойство      | властивість    | 属性        |
| **condition**   | Bedingung   | condición     | condition   | condizione   | 条件             | 조건       | condição     | условие       | умова          | 条件        |
| **log** (noun)  | Protokoll   | registro      | log         | log          | ログ             | 로그       | log          | лог           | лог            | 日志        |
| **bold**        | Fett        | negrita       | gras        | grassetto    | 太字             | 굵게       | negrito      | жирный        | жирний         | 粗体        |
| **line**        | Zeile       | línea         | ligne       | riga         | 行               | 행         | linha        | строка        | рядок          | 行          |
| **segment**     | Segment     | segmento      | segment     | segmento     | セグメント       | 세그먼트   | segmento     | сегмент       | сегмент        | 段          |
| **snapshot**    | Snapshot    | instantánea   | instantané  | istantanea   | スナップショット | 스냅샷     | instantâneo  | снимок        | знімок         | 快照        |
| **maintenance** | Wartung     | mantenimiento | maintenance | manutenzione | メンテナンス     | 유지관리   | manutenção   | обслуживание  | обслуговування | 维护        |
| **word**        | Wort        | palabra       | mot         | parola       | 単語             | 단어       | palavra      | слово         | слово          | 单词        |
| **character**   | Zeichen     | carácter      | caractère   | carattere    | 文字             | 문자       | caractere    | символ        | символ         | 字符        |

Grammatical gender, where it decides agreement: `Journal` n. / `Notiz` f. / `Regal` n.
(de) · `diario` m. / `nota` f. / `estante` m. (es) · `journal` m. / `note` f. /
`étagère` f. (fr) · `diario` m. / `nota` f. / `scaffale` m. (it) · `diário` m. /
`nota` f. / `prateleira` f. (pt) · `журнал` m. / `заметка` f. / `полка` f. (ru) ·
`журнал` m. / `нотатка` f. / `полиця` f. / `представлення` n. / `оформлення` n. (uk).

## Notes on the picks

- **ja/ko `note`.** Both locales had a near-even split with メモ / 메모 ("memo",
  "sticky note"). ノート / 노트 is what Obsidian's own ja/ko UI calls a vault note.
- **zh `journal`.** The corpus was a three-way split between 日志 (a software log),
  期刊 (a periodical) and 日记. 日记 is the diary sense the plugin actually means.
  **日志 is still correct for the logging feature** — the checker allows it under
  `logging_*` keys and nowhere else.
- **pt `journal`.** Twenty strings said `periódico` (a periodical). The original
  checker banned `revista|jornal` but not this, so it passed CI for months.
- **ru/uk `note`.** Both locales carried a second wrong word alongside the musical
  one: `примечание` / `примітка`, a footnote or annotation rather than a vault note.
  It read plausibly enough to survive several passes, so both stems are banned
  outright — no key legitimately means "footnote".
- **uk `view`.** Four words were in play for one object: `подання` (10 strings),
  `перегляд` (5), `вигляд` (4) and `представлення` (1) — the dashboard, the add button
  and the delete modal each named it differently. `представлення` is now canonical.
  `перегляд` stays correct for the _act_ of viewing (`попередній перегляд` = preview),
  and `виглядає` ("looks like") is not the noun, so the ban uses a Unicode word edge.
- **uk `log`.** "Logs" cannot be `журнали` here: that is the plugin's own core noun, so
  `logging_dump_succeeded` read "Journals written to {path}". `лог` is used instead, and
  the checker bans `журнал` **only** under `logging_*` keys. Same rule for ru.
- **`bold`.** Not a domain noun, but it failed the same way: eight of ten locales read
  it as the courage adjective rather than the typographic weight (de "Deutlich", es
  "Atrevido", fr "Audacieux", pt "Audacioso", ru "Смелый", ja 大胆な, ko 용감한, zh
  大胆的). It is in the table because the nav-row style control labels the button with
  a bare `B` glyph, so this string is the only name the control has.
- **`line` / `segment`.** New with the nav-block reshape: a **line** is the horizontal
  group (`block_lines_*`, `interval_block_section_title`), a **segment** is the styled,
  linked unit within it (`block_lines_add_segment`, `nav_block_segment_*`). English
  settled on "line" over "row" for the container noun (see `CLAUDE.md`'s UI-conventions
  section for the reasoning). Most locales' existing wording for these keys was already
  the standard word for "a line of text" (de `Zeile`, fr `ligne`, pt `linha`, it `riga`,
  ru `строка`, uk `рядок`, ja/zh 行), so only the key names needed to move off `block_rows_*`.
  **es was a real gap**: `fila` means a row of chairs or a queue, not a line of text —
  corrected to `línea`. **ko `행`** is left as-is but unverified: it is the standard word
  for a spreadsheet/table row, and Korean has a separate, more colloquial word for "a line
  of text" (`줄`); this pairing needs a native check the way uk got one. The `nav-row` CSS
  class stays as a legacy styling hook and is intentionally not part of this pair.

## Literal tokens

Some messages quote syntax the user types verbatim. Translating it yields copy that
reads perfectly and instructs the reader to type something the parser rejects — the
failure mode the term table cannot see, because every word in it is correctly
translated. The checker asserts these survive:

- `variable_modifications_unit_*` — the shift tokens `d h m q w y`. ru shipped
  `д — дней`, `ч — часов`, `в — недель`; a reader following it typed `+1д` and got
  nothing. Each message must **start** with its Latin token character.
- `journal_edit_code_block_home_option_show` — the values `day week month quarter year
custom`. Nine of ten locales translated them, and one rendered `custom` as
  "settings". Only ko got it right.
- `journal_edit_code_block_home_option_scale` — the key `scale:`.
- `journal_edit_code_block_timeline_option_mode` / `_weeks` — `week month quarter
calendar` and `default left right none`.
- `code_blocks_home_empty` — the block options `show` and `shelf`.
- `variable_modifications_boundary_unit` — the units inside `<startOf=…>` / `<endOf=…>`.
  This is the "Supported units" list in the date-modifications modal, so each row **is**
  the token. Nine of ten locales had translated them, which documented `<startOf=Jahr>`
  and `<startOf=년도>`. Only ko had it right, and only because its reviewer noticed the
  class the other eight missed. Asserted per match key via `containsSelectorValue`.
- `journal_edit_variable_current_date_description`, `_current_time_description`,
  `_time_description`, `view_block_markdown_template_variables_intro` — the moment.js
  format tokens `YYYY-MM-DD` and `HH:mm`. de shipped `JJJJ-MM-TT`, uk `РРРР-ММ-ДД` and
  `ГГ:хх`, and es/fr/it/pt each their own; copying one into a format field puts a literal
  `JJJJ` in the filename.
- `templater_support_option_trigger_off` / `_on` — Templater's own setting names,
  `Trigger Templater on new file creation` and `Enable Folder Templates`. Templater ships
  no localization, so its UI is English in every Obsidian language: a translated name
  points at a control that does not exist. The generalization is that any string telling
  the user to find something in **another** application's UI must quote that control in
  the language that application actually displays.

## Mechanical checks

- **HTML entities.** `decoration_string_op_label` shipped `&lt;=`, `&gt;`, `&gt;=` in
  all ten locales, rendered literally in the UI. Nothing may contain an entity.
- **Padded placeholders.** The CLI wrote `"{name} ."` and `( {current} )`. Roughly
  fifteen per locale. The rule matches `[ \t]` only, which is what makes French legal:
  `fr` puts **U+202F** (narrow no-break space) inside `« … »` and before `;` `:` `?` `!`,
  so `« {name} »` passes with U+202F and fails with an ordinary space. Copy the spacing
  from an existing `fr` string rather than typing the guillemets fresh.
- **Whitespace in match keys.** Paraglide splits composite keys on `,` without
  trimming, so `side=start, day=1` leaks a leading space into the generated input name
  and breaks the types. This is what `fix-i18n-variant-keys.mjs` used to repair after
  each MT run; it is now asserted instead.

## Rules that match nothing

A banned-term rule is only as good as its regex, and a regex that never fires looks
exactly like a rule that is working. Two shipped that way:

- **es `logging`** banned `/forestal/i`. The string that actually shipped — and that the
  table at the top of this file cites — was `Explotación florestal`. `/forestal/` does not
  match `florestal`, so the rule protected nothing from the day it was written, while the
  exact string it was authored for sat in the corpus.
- **de `journal`** banned `/Tagebuch/i`, which never matches the umlauted plural
  `Tagebüchern`. That form was live in two strings and passed CI for months.

Both are the same failure the Cyrillic `\b` comment guards against: a pattern that reads
as protective and tests nothing. When adding a rule, **check it against the string that
motivated it** before landing, and prefer a stem (`/Tageb(u|ü)ch/`, `/fl?orestal/`) over
a single surface form. Four howlers named in the table above had no guarding rule at all
until this pass — es `florestal`, uk `Хвороба`, uk `Стартап`, fr `Journal de bord`.

## Plural categories

The base locale only needs `count=1` / `count=*`, and every locale inherited that shape
— so Ukrainian rendered "5 журнали" and "2 нотатки пропущено", both wrong.

A locale may declare **its own** selectors; paraglide compiles each locale's message to
its own function, so this does not affect the others. Ukrainian uses `Intl.PluralRules`
categories:

```json
{
  "declarations": ["input count", "local countPlural = count: plural"],
  "selectors": ["countPlural"],
  "match": {
    "countPlural=one": "{count} журнал",
    "countPlural=few": "{count} журнали",
    "countPlural=many": "{count} журналів",
    "countPlural=*": "{count} журналу"
  }
}
```

Exact-value matches still win over categories when both are present, so
`journal_delete_connected_count` keeps a `count=0` row ahead of its plural rows.
Paraglide compiles variants to sequential `if` returns in declaration order and the
catch-all emits an unconditional `return`, so **every exact row must be declared before
the category rows and every all-`*` row must be last** — a misplaced `countPlural=*`
silently swallows every branch below it.

**ru** is now converted the same way, including `relative_date_ago` / `_from_now` and
`journal_write` (`durationPlural`). **fr** is converted too, for a different reason: it is
a `one`/`other` locale, but CLDR puts **0 in `one`** (`i = 0,1`), which the inherited
`count=1` / `count=*` shape cannot express — it rendered "0 journaux".

The `one`/`other` locales (de, es, it, pt) keep the inherited shape, which is correct for
them; es/it/de/pt treat 0 as plural. ja, ko and zh have no plural inflection and keep a
single form, but they need a **counter/measure word** the English shape does not imply:
`개` (ko), `件` (ja), `个 / 条 / 项` (zh). `journal_add_modal_every_unit` crosses `unit` ×
count, so a locale needing case marking on the unit must carry it there.

## What the checker does not catch

It bans wrong _terms_ and asserts _literals_; it cannot see wrong _grammar_. Known
classes still in the corpus, all from the same context-free-MT root cause:

- **Homonym picked from the wrong domain.** Every non-domain UI noun is exposed the
  same way the domain nouns were, and the table cannot grow to cover all of them.
  Sweeps have fixed `border` read as a national frontier, `property` as assets, `label`
  as a trademark, `icon` as a religious icon, `offset` as the verb "to compensate",
  `weekday` as a workday, `background` as a backstory, `divider` as a mathematical
  divisor, `spacer` as a mechanical strut, `solid` as hard matter, and `bottom` as the
  bottom of a vessel. Nothing prevents the next one.
- **Part-of-speech misparse.** `bulk_add_filter_combinator_label` is the imperative
  "Filter notes", and seven of ten locales rendered it as the noun phrase "notes about
  filters". `command_type_label` turned ten of its variants into past passives
  ("_was opened_ the same day next week") in uk. Fixed where found.
- **Register drift inside a single match block.** `decoration_condition_type_label`
  mixed imperative and polite-plural forms across variants in uk; `command_type_label`
  mixed infinitive, imperative and **past passive** ("_was opened_ the same day next
  week") in most locales. Every locale now commits to one form per string kind — buttons,
  commands and options in one, descriptions and errors in another — but which form is
  correct is a per-language convention, not a rule this file can impose.
- **Ambiguous English source.** A subset of these are not translation defects at all.
  Three independent locales rendered `block_lines_decorate_whole_label` ("Decorate whole
  block") as a _city block_; two read `view_toolbar_period_buttons_config` ("Show week")
  as a noun phrase about a theatrical show; `journal_delete_mode_option` ("Clear") was
  read as the adjective in three. Bare English UI shorthand carries no part-of-speech
  marking, so a translator gets a coin flip. `journal_edit_anchor_description` ("This date
  is used to connect some number to it for further calculations") is vague enough that
  several locales elaborated it into something the setting does not do. These will keep
  breaking on every locale added, whoever translates them — the durable fix is on the
  `en.json` side, not the locale side.
- **Period nouns spliced in as `{unit}`.** A message like "Previous {unit}" survives
  translation unchanged and then renders the raw enum ("Vorherige week"), and even once
  translated the adjective cannot agree with the noun it precedes. Period and level
  nouns therefore never travel as a parameter: the message takes the period as a
  _selector_ and each variant spells the whole phrase, the way `relative_date_this` and
  `view_toolbar_button_default_tooltip_prev_unit` do. Where two dropdowns are read as
  one phrase, the adjective-only message selects on the neighboring unit too
  (`view_toolbar_button_config_direction_option`), a no-op `unit=*` pair in locales
  without gender agreement.

## Coverage

All eleven locales are complete at **711/711**. Every locale has had a line-by-line pass
over every key against `en.json`, and the `decoration_breakdown_*`, `decoration_badge_*`
and week-reanchor keys are translated everywhere.

Be precise about what that pass was, because "reviewed" overstates it for nine of them:

- **uk** was reviewed by a native speaker. It is the only locale where the output was
  verified by someone who reads the language.
- The 23 `journal_sequence_*` and numbering-warning keys were translated by an agent
  working from this file — the same standard as the sweep below, not native-verified.
  Its choices worth a native eye: the word for an odometer **digit** (de `Stelle`, ru
  `разряд`, uk `розряд`, ja `桁`, ko `자리`, zh `位`), and whether _Slowest_ / _Fastest_
  read as speed rather than as a ranking of importance.
- **de, es, fr, it, ja, ko, pt, ru, zh** were swept by a reviewer working from the domain
  context this file records — the thing the original one-string-at-a-time pipeline never
  had. That is enough to remove wrong-domain homonyms, part-of-speech misparses and
  literal-token breakage, all of which are checkable against the source. It is **not**
  enough to certify that the copy reads naturally, that the register matches what the
  locale's software conventions expect, or that the terminology choices are what that
  language's Obsidian community actually uses. Each pass picked one convention and held
  it consistently, which is strictly better than the mix it replaced, but consistent is
  not the same as idiomatic.

Treat these nine as **swept, not native-verified**. Open questions a native speaker should
settle are worth collecting per locale; the recurring ones are the rendering of _ribbon_
(every Romance locale reached for Microsoft Office's term for a different object),
_frontmatter_ (uk transliterates as `Фронтматер` where the other ten keep the Latin
`Frontmatter` or transliterate to kana/hangul), _decoration_ (several locales landed on a
word closer to "ornament" than to conditional styling), and _vault_.

Two classes remain structurally unfixable without an `en.json` change, and both are noted
where they occur: `relative_date_last_named_day` splices a `moment`-supplied weekday whose
gender differs within a locale, and `relative_date_custom_*` splices a **user-typed**
journal name of unknown gender. Locales that need agreement there currently use invariant
phrasings. The fix is the one this file already prescribes for period nouns — make the
noun a selector rather than a parameter.
