# Setup examples

Complete configurations for common setups. Each lists the settings as they appear on a journal's
settings page; anything not listed stays at its default.

::: v-pre

## Daily work journal

A note for every day, created automatically, filed under one folder. Auto-create has no weekday
filter, so weekends get a note too.

| Setting                      | Value                     |
| ---------------------------- | ------------------------- |
| **I'll be writing**          | daily                     |
| **Folder**                   | `Work/DailyNotes`         |
| **Note name template**       | `{{date}} Daily Log`      |
| **Default date format**      | `YYYY-MM-DD`              |
| **Auto-create today's note** | on                        |
| **Start writing on**         | your first day at the job |

When Obsidian starts on 14 September 2026, it creates `Work/DailyNotes/2026-09-14 Daily Log.md`. Days
before the start date cannot be created.

## Project sprints

Two-week sprints, numbered.

| Setting                       | Value                                           |
| ----------------------------- | ----------------------------------------------- |
| **I'll be writing**           | **Custom intervals**, **Every** 2 weeks         |
| **Start date**                | the first day of sprint 1                       |
| **Folder**                    | `Projects/{{journal_name}}/Sprints`             |
| **Note name template**        | `Sprint {{index}}`                              |
| **Enable sequential numbers** | on — `index` **Continuous**, **Start number** 1 |

A journal named `Apollo` writes `Projects/Apollo/Sprints/Sprint 1.md`, `Sprint 2.md`, and so on.

## Academic term notes

A note per week of a term, numbered from the term's first week and filed by month.

| Setting                       | Value                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| **I'll be writing**           | weekly                                                         |
| **Folder**                    | `Education/{{date:YYYY}}/{{date:MMMM}}`                        |
| **Note name template**        | `Week {{index}} - {{start_date:MMM D}} to {{end_date:MMM D}}`  |
| **Start writing on**          | the week the term starts                                       |
| **End writing**               | **After date** — the week the term ends                        |
| **Enable sequential numbers** | on — the start date is the **Anchor date**, **Start number** 1 |

With weeks starting on Sunday and a term starting in the week of 7 September 2026, the first notes are
`Education/2026/September/Week 1 - Sep 6 to Sep 12.md` and `Week 2 - Sep 13 to Sep 19.md`. A date after
the term creates nothing and says "No journal covers that date."

## Release and sprint numbering

Sprints numbered within releases: six sprints make a release.

| Setting                       | Value                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **I'll be writing**           | **Custom intervals**, **Every** 2 weeks                                                                                   |
| **Folder**                    | `Projects/{{journal_name}}/Releases`                                                                                      |
| **Note name template**        | `Release{{release}}Sprint{{sprint}}`                                                                                      |
| **Enable sequential numbers** | on — digit `release` **Start number** 4711, **Continuous**; digit `sprint` **Start number** 1, **How many per release** 6 |

Produces `Release4711Sprint1` through `Release4711Sprint6`, then `Release4712Sprint1`.

:::
