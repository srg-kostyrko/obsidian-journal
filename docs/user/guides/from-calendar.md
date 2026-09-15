# Coming from Calendar

The Calendar plugin draws one month grid and marks days with dots. Everything it does has an equivalent
here, usually a more configurable one.

| In Calendar                                                      | In Journals                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dots sized by word count                                         | [Decorations](/decorations) with note-size conditions — see [Word-count dots](#word-count-dots) below                                      |
| A hollow dot for incomplete tasks                                | A decoration with **Check if note has open tasks** or **Check if all tasks are completed**                                                 |
| Colouring days by tag or content                                 | Decoration conditions on title, tag, frontmatter property, note size or weekday, painting colors, borders, shapes, corners and icons       |
| One calendar per vault                                           | Any number of [journals](/journals), grouped on [shelves](/shelves), with views scoped to a shelf                                          |
| A fixed month grid padded to six weeks                           | A month grid of exactly the weeks the month spans, plus week grids, notes-by-date lists and toolbars composed into a [view](/views)        |
| Week numbers on the left                                         | **Before weekdays**, **After weekdays** or **Hidden**, globally or per calendar block                                                      |
| Clicking a day or week number                                    | Clicking any period — day, week, month, quarter or year — from its cell or heading                                                         |
| `Reveal active note` command                                     | **Follow active note** on a view, which moves the view as you open notes                                                                   |
| Start of week from the locale, or a locale override to change it | [Week configuration](/periods#weeks), which sets the first day of the week and week 1 of the year, independently of your Obsidian language |
| Notes found by file name in one folder                           | Notes identified by their properties, so they keep working when moved or renamed — see [Your existing notes](#your-existing-notes)         |

Two things Calendar has no equivalent for: a note's creation date for **Notes by date** can come from a
property rather than the file, and a day can hold any number of extra notes through
[notelets](/notelets).

::: v-pre

## Your existing notes

Calendar shows the daily notes that the core Daily notes plugin — or Periodic Notes, when it is on —
creates, and finds them by file name. Journals finds notes by their properties instead, and adopts a
note that was already in your vault only when you rename or move it onto a path the journal would use —
so a new journal starts with an empty calendar. For your daily notes:

1. Create a daily journal whose **Folder** is the folder your daily notes are in. Its **Note name
   template** `{{date}}` and **Default date format** `YYYY-MM-DD` match Daily notes' own default; if
   you changed that format, use yours. New notes then land beside the old ones.
2. Connect the old notes with [Bulk add](/notes#bulk-add): **Source folder** that folder, **Read the
   date from** **Note title**, and the same date format. The first run is a dry run, which only lists
   what it would do.

Weekly notes go the same way, into a weekly journal. Calendar names them with its **Weekly note
format**, which it offers while **Show week number** is on and Periodic Notes' weekly notes are off.

:::

## Word-count dots

Calendar draws one dot per 250 words, up to five. In Journals that is five decorations on the daily
journal, each drawing one dot in the same position, so they stack:

| Decoration | Condition                                | Style          |
| ---------- | ---------------------------------------- | -------------- |
| 1          | **Check if note exists**                 | a small circle |
| 2          | **Check note size** — **Words** `>` 500  | a small circle |
| 3          | **Check note size** — **Words** `>` 750  | a small circle |
| 4          | **Check note size** — **Words** `>` 1000 | a small circle |
| 5          | **Check note size** — **Words** `>` 1250 | a small circle |

A note of 800 words matches the first three and shows three dots. A note of 1300 words matches all five,
but **Marks shown per position** caps how many are drawn: at its default of 3 it shows two dots and
`+3`. Set it to **Unlimited**, or to at least 5, to see all five. The run behind these numbers is under
[Word-count bands](/decorations#word-count-bands).

For one dot per band instead of a growing row, put two note-size conditions in one decoration — `>=`
250 and `<` 1000 — so it matches only inside that band, and give each band its own color.
