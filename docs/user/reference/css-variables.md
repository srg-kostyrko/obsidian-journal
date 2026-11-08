# CSS variables

Everything the [Calendar appearance](/views#calendar-appearance) editor sets is also a CSS variable, so a
[CSS snippet](https://help.obsidian.md/snippets) can set it instead. A snippet wins over the editor without
`!important`, from any selector that reaches the calendar — `body` is enough — and the editor's preview shows the snippet's value.

The variables reach the month and week calendars of views and the calendars of
[timelines](/reference/code-blocks). Rows of the [Custom intervals](/views#custom-intervals) block read
**Today**, **Selected date** and **Open note** and the cells' padding and corner radius. A
[period button](/views#toolbar) whose note is open takes the open note's color and text color.

## How a value is chosen

Each control that a variable backs shows that variable's name in the editor. The editor keeps its own values out of sight,
under names of its own, and a calendar reads the snippet's value first, then the editor's, then the
stock one listed below.

Every variable also has a narrow form, its name ending in `-narrow`, for
[narrow calendars](/views#narrow-calendars) — narrower than about 28em. On a narrow calendar the
order is:

1. the snippet's `-narrow` value;
2. the editor's value for narrow calendars: what you set under **Narrow**, or what a narrow default
   makes of an all-widths value, such as the selected date's narrow background style;
3. the narrow stock value, for the five variables that have one;
4. then the same three for all widths: the snippet's value, the editor's, the stock one.

So a snippet that sets only the all-widths name does not reach a narrow calendar where the editor
has a **Narrow** value, or where the variable has a narrow stock value. Set the `-narrow` name too.

A snippet cannot move the 28em breakpoint: CSS variables do not work in the condition of a container query.

## Values

- Colors take any CSS color, a theme variable such as `var(--color-orange)` included.
- **Ring width** and the other sizes take a CSS length. A ring width of `0px` draws no ring.
- **Strength** is how strongly a highlight's color fills the day, as a number from `0` to `1`; `0`
  draws no background. The editor offers 5% to 100%.
- **Weight** takes a CSS font weight, such as `var(--font-bold)` or `600`. **Italic** takes `italic` or
  `normal`. **Case** takes `none`, `uppercase`, `lowercase` or `capitalize`.
- A `-layer` variable, the editor's **Over decorations**, is `1` to draw a highlight's ring or background,
  and its text, over a day's [decorations](/decorations), and `-1` to draw them under. Other values are not
  supported.
- A highlight's text color, weight and italic also take `unchanged`, which leaves the text to the next
  highlight, as the editor's [**Unchanged**](/views#unchanged) does. It needs the same WebView support.

A highlight's **Style** in the editor is not a variable of its own; it comes from the others. **Text
only** is a ring width and a strength of `0`, **Ring** a ring width above `0` with a strength of
`0`, **Background** a strength above `0` with a ring width of `0`, and **None** is **Text only** with the text color, weight and italic set to `unchanged`.

A stock value of _inherited_ means the calendar sets nothing there, and the text keeps what it
inherits.

## Highlights

The highlights are `today`, `selected` (the selected date), `active` (the open note's day), `outside`
(days outside the month), `weekend` and `current-week`. A weekend and a current-week color and
strength fill a band across the grid rather than single days. The current week's week number has text of its own, after the table.

| Variable                                  | Changes             | Stock                       | Narrow stock |
| ----------------------------------------- | ------------------- | --------------------------- | ------------ |
| `--journal-cell-today-color`              | Ring and fill color | `transparent`               | —            |
| `--journal-cell-today-ring-width`         | Ring width          | `0px`                       | —            |
| `--journal-cell-today-strength`           | Background strength | `0`                         | —            |
| `--journal-cell-today-text-color`         | Text color          | `var(--text-accent)`        | —            |
| `--journal-cell-today-text-weight`        | Text weight         | inherited                   | —            |
| `--journal-cell-today-text-italic`        | Text italic         | inherited                   | —            |
| `--journal-cell-today-layer`              | Over decorations    | `-1`                        | —            |
| `--journal-cell-selected-color`           | Ring and fill color | `var(--interactive-accent)` | —            |
| `--journal-cell-selected-ring-width`      | Ring width          | `2px`                       | `0px`        |
| `--journal-cell-selected-strength`        | Background strength | `0`                         | `0.2`        |
| `--journal-cell-selected-text-color`      | Text color          | inherited                   | —            |
| `--journal-cell-selected-text-weight`     | Text weight         | inherited                   | —            |
| `--journal-cell-selected-text-italic`     | Text italic         | inherited                   | —            |
| `--journal-cell-selected-layer`           | Over decorations    | `1`                         | —            |
| `--journal-cell-active-color`             | Ring and fill color | `var(--interactive-accent)` | —            |
| `--journal-cell-active-ring-width`        | Ring width          | `0px`                       | —            |
| `--journal-cell-active-strength`          | Background strength | `1`                         | —            |
| `--journal-cell-active-text-color`        | Text color          | `var(--text-on-accent)`     | —            |
| `--journal-cell-active-text-weight`       | Text weight         | inherited                   | —            |
| `--journal-cell-active-text-italic`       | Text italic         | inherited                   | —            |
| `--journal-cell-active-layer`             | Over decorations    | `-1`                        | —            |
| `--journal-cell-outside-color`            | Ring and fill color | `transparent`               | —            |
| `--journal-cell-outside-ring-width`       | Ring width          | `0px`                       | —            |
| `--journal-cell-outside-strength`         | Background strength | `0`                         | —            |
| `--journal-cell-outside-text-color`       | Text color          | `var(--text-muted)`         | —            |
| `--journal-cell-outside-text-weight`      | Text weight         | inherited                   | —            |
| `--journal-cell-outside-text-italic`      | Text italic         | inherited                   | —            |
| `--journal-cell-outside-layer`            | Over decorations    | `-1`                        | —            |
| `--journal-cell-weekend-color`            | Band color          | `transparent`               | —            |
| `--journal-cell-weekend-ring-width`       | Band ring width     | `0px`                       | —            |
| `--journal-cell-weekend-strength`         | Band strength       | `0`                         | —            |
| `--journal-cell-weekend-text-color`       | Text color          | inherited                   | —            |
| `--journal-cell-weekend-text-weight`      | Text weight         | inherited                   | —            |
| `--journal-cell-weekend-text-italic`      | Text italic         | inherited                   | —            |
| `--journal-cell-weekend-layer`            | Over decorations    | `-1`                        | —            |
| `--journal-cell-current-week-color`       | Band color          | `transparent`               | —            |
| `--journal-cell-current-week-ring-width`  | Band ring width     | `0px`                       | —            |
| `--journal-cell-current-week-strength`    | Band strength       | `0`                         | —            |
| `--journal-cell-current-week-text-color`  | Days' text color    | inherited                   | —            |
| `--journal-cell-current-week-text-weight` | Days' text weight   | inherited                   | —            |
| `--journal-cell-current-week-text-italic` | Days' text italic   | inherited                   | —            |
| `--journal-cell-current-week-layer`       | Over decorations    | `-1`                        | —            |

The current week's number:

| Variable                                              | Changes     | Stock                | Narrow stock |
| ----------------------------------------------------- | ----------- | -------------------- | ------------ |
| `--journal-cell-current-week-week-number-text-color`  | Text color  | `var(--text-accent)` | —            |
| `--journal-cell-current-week-week-number-text-weight` | Text weight | `var(--font-bold)`   | —            |
| `--journal-cell-current-week-week-number-text-italic` | Text italic | inherited            | —            |

## Text

The text parts are `heading` (the month heading), `weekday` (the weekday header), `week-number` and
`date` (the date number in each day).

| Variable                            | Changes | Stock                | Narrow stock |
| ----------------------------------- | ------- | -------------------- | ------------ |
| `--journal-cell-heading-size`       | Size    | `inherit`            | —            |
| `--journal-cell-heading-weight`     | Weight  | `inherit`            | —            |
| `--journal-cell-heading-italic`     | Italic  | `inherit`            | —            |
| `--journal-cell-heading-color`      | Color   | `inherit`            | —            |
| `--journal-cell-heading-case`       | Case    | `inherit`            | —            |
| `--journal-cell-weekday-size`       | Size    | `0.6em`              | —            |
| `--journal-cell-weekday-weight`     | Weight  | `inherit`            | —            |
| `--journal-cell-weekday-italic`     | Italic  | `inherit`            | —            |
| `--journal-cell-weekday-color`      | Color   | `var(--text-muted)`  | —            |
| `--journal-cell-weekday-case`       | Case    | `inherit`            | —            |
| `--journal-cell-week-number-size`   | Size    | `0.85em`             | —            |
| `--journal-cell-week-number-weight` | Weight  | `var(--font-normal)` | —            |
| `--journal-cell-week-number-italic` | Italic  | `inherit`            | —            |
| `--journal-cell-week-number-color`  | Color   | `var(--text-muted)`  | —            |
| `--journal-cell-week-number-case`   | Case    | `inherit`            | —            |
| `--journal-cell-date-size`          | Size    | `1.1em`              | `1em`        |
| `--journal-cell-date-weight`        | Weight  | `inherit`            | —            |
| `--journal-cell-date-italic`        | Italic  | `inherit`            | —            |
| `--journal-cell-date-color`         | Color   | `inherit`            | —            |
| `--journal-cell-date-case`          | Case    | `inherit`            | —            |

## Week-number divider and cells

The divider is the line between the week numbers and the days; a width of `0px` hides it. The cells'
padding is the space around a day's label, inside its decorations. The row height is the smallest
height a row takes. Out of the box a row of days grows with the calendar's width, from 26 pixels to
64, and the heading row stays at 26; a value you set applies to the heading row too.

| Variable                                   | Changes           | Stock                               | Narrow stock |
| ------------------------------------------ | ----------------- | ----------------------------------- | ------------ |
| `--journal-cell-week-number-divider-color` | Divider color     | `var(--background-modifier-border)` | —            |
| `--journal-cell-week-number-divider-width` | Divider width     | `1px`                               | —            |
| `--journal-cell-cell-padding`              | Padding           | `0px`                               | —            |
| `--journal-cell-cell-radius`               | Corner radius     | `var(--radius-s)`                   | —            |
| `--journal-cell-cell-gap`                  | Gap between cells | `var(--size-2-1)`                   | `1px`        |
| `--journal-cell-cell-min-height`           | Row height        | `clamp(26px, 7cqi, 64px)`           | `26px`       |

## Stability

The names on this page and what their values mean are a public surface. A change to either is a
breaking change: renaming or removing a variable, or changing the unit or meaning of its value — a
strength read as a percentage, say, or a layer counting more than over and under. A breaking change
is listed in the [changelog](https://github.com/srg-kostyrko/obsidian-journal/blob/main/CHANGELOG.md);
the old name is not kept alongside the new one. Adding a variable is not a breaking change.

The stock values are not part of that promise. They are the calendar's default look, and a release
may change them; the changelog says when it does. A snippet that relies on a stock value — one that
sets only a ring color, expecting the selected date to keep its ring — can change look on an update
without any variable changing.

The names the editor keeps its own values under, and every other class and attribute in the calendar,
are not part of it either.

## Examples

### Today with a background

```css
body {
  --journal-cell-today-color: var(--color-orange);
  --journal-cell-today-strength: 0.3;
}
```

Today gets an orange tint and keeps its accent text. A view selects today when it opens, so the
selected date's ring is drawn around the tint. Today is drawn under decorations, so on a day with a
filled decoration the tint sits under the fill, and on the open note's day the open note's fill takes
its place.

![Today tinted orange inside the selected date's ring](/assets/css-variables-today-background-light.png){.light-only}
![Today tinted orange inside the selected date's ring](/assets/css-variables-today-background-dark.png){.dark-only}

### A weekend band

```css
body {
  --journal-cell-weekend-color: var(--color-blue);
  --journal-cell-weekend-strength: 0.15;
}
```

A pale blue band runs down each run of weekend columns, under the days' decorations.

![A blue band down the Saturday and Sunday columns](/assets/css-variables-weekend-band-light.png){.light-only}
![A blue band down the Saturday and Sunday columns](/assets/css-variables-weekend-band-dark.png){.dark-only}

### Taller rows in narrow calendars

```css
body {
  --journal-cell-cell-min-height-narrow: 34px;
  --journal-cell-date-size-narrow: 1.1em;
}
```

Narrow calendars, such as one in a slim sidebar, get rows at least 34 pixels high,
the heading row included, and wide calendars' date size.
Both variables have a narrow stock value, so the all-widths names would not reach narrow calendars.
