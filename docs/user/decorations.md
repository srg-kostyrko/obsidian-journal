# Decorations

Journals provides a decoration system to visually distinguish notes in calendars and navigation blocks. Decorations live in three scopes:

- **Calendar decorations** on the main settings page apply to every calendar, whatever journals are on screen
- **Shelf decorations** on a shelf apply while that shelf is in view
- **Journal decorations** on a journal apply to that journal's notes

They **layer**: for each property a cell can only have once — background, text color, each border side, each corner — the most specific scope wins, resolved vault-wide first, then shelf, then journal. Shapes and icons never compete; they stack in the nine placement slots.

- **Conditions**: which conditions are offered depends on the scope

  - **Note content** (journal decorations): Title, tag, or frontmatter property. Titles and tags match by contains, starts with, or ends with; properties also offer exists, equals, comparisons, and true/false for checkboxes
  - **Note status** (journal decorations): Has note, has open tasks, all tasks completed
  - **Has notelet** (journal decorations): Matches a period that has at least one [notelet](/notelets). Pick the notelet types it counts, or leave them all off to match a notelet of any type
  - **Note size** (journal decorations): Matches on the note's word or character count, using the same definition as Obsidian's own word count — frontmatter is not counted, everything else is, including code blocks and comments. The number is the one Obsidian shows in the status bar.
  - **Date and weekday** (calendar and shelf decorations, and daily journals): A specific day, month, and/or year — each of which can be left as "any" — or a set of weekdays
  - **Position** (custom-interval journals): The Nth day of the interval, counted from its start or from its end

- **Styles**: Customize appearance with:

  - Background color
  - Text color
  - Borders (uniform or per-side with custom width, color, style)
  - Shapes (square, circle, or a triangle pointing up, down, left, or right, in nine positions)
  - Corner markers
  - Icons (from Obsidian's icon set)

  Every color can be transparent, a theme color, or a custom color. A transparent color cancels what a less specific scope painted.

- **Combinations**: Use AND logic (all conditions must match) or OR logic (any condition can match)

- **Match badge**: Each decoration in the settings list reports how often it matched recently ("Matched 3 of the last 90 days"), so a rule that never fires is easy to spot. A note-size rule shows no badge — estimating it would mean reading every note in the window

- **Decoration breakdown**: Right-click a decorated cell — in a calendar, a navigation block, or a toolbar's period buttons — and choose _Explain decorations_ to see, property by property, which rule produced each color, border, and mark, and which rules it overrode

- **Inspect a date**: From any decorations section, open _Inspect a date_ to pick a date and a shelf and see everything decorating it across all three scopes

- **Marks shown per position**: A cell can collect marks from many decorations at once, and they all land in the same one of nine positions. _Marks shown per position_ on the main settings page caps how many are drawn there — 3 by default, or Unlimited. Anything over the cap collapses into a `+N` badge; hover it to see the marks it hides. The cap applies to calendars, navigation blocks and interval rows alike, and it changes only what is drawn, never which decorations matched — _Explain decorations_ still lists them all

- **Recipes**:

  - **Coming from the Calendar plugin?** Its "words per dot" ladder (default 250, capped at five dots) becomes five decorations here, each with one dot style: a _has note_ condition, then note size > 500, > 750, > 1000, and > 1250
  - **One dot per band, instead of a growing row**: add two note-size conditions to the same decoration — >= 250 and < 1000 — and it matches only inside that band, so each band can carry its own color or shape
