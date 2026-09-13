# Coming from Calendar

The Calendar plugin draws one month grid and marks days with dots. Everything it
does has an equivalent here, usually a more configurable one.

| In Calendar                                                      | In Journals                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dots sized by word count                                         | A [decoration](/decorations) with a note-size condition — the "words per dot" ladder is written out as a recipe there                                                    |
| A hollow dot for incomplete tasks                                | A decoration with the _has open tasks_ or _all tasks completed_ condition                                                                                                |
| Colouring days by tag or content                                 | Decoration conditions on title, tag, frontmatter property, note size or weekday, with colours, borders, shapes, corners and icons                                        |
| One calendar per vault                                           | Any number of [journals](/journals), grouped on [shelves](/shelves), with views scoped to a shelf                                                                        |
| A fixed month grid padded to six weeks                           | A month grid of exactly the weeks the month spans, plus week grids, notes-by-date lists and toolbars composed into a [view](/views-and-blocks)                           |
| Week numbers on the left                                         | Week numbers before the weekdays, after them, or hidden, globally or per block                                                                                           |
| Clicking a day or week number                                    | Clicking any period — day, week, month, quarter or year — from its cell or heading                                                                                       |
| `Reveal active note` command                                     | The _Follow active note_ view setting, which moves the view as you open notes                                                                                            |
| Start of week from the locale, or a locale override to change it | [Week presets](/settings#calendar-settings) that set the first day of the week and how the first week of the year is determined, independently of your Obsidian language |
| Notes found by file name in one folder                           | Notes identified by their frontmatter, so they keep working when moved or renamed                                                                                        |

Two things Calendar has no equivalent for: a note's date can come from a
frontmatter property rather than its file name, and a day can hold any number of
extra notes through [notelets](/notelets).
