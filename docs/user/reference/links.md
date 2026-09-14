# Links

An `obsidian://journals` link opens a journal note from anywhere — another note, a bookmark, a
script, another app:

```text
obsidian://journals?journal=Work&date=today
```

| Parameter | Value                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------ |
| `journal` | the journal's name                                                                               |
| `type`    | instead of `journal`: `day`, `week`, `month`, `quarter` or `year` — every journal of that length |
| `date`    | `today` (the default), `YYYY-MM-DD`, or a shift from today: `+1d`, `-2w`, `+1m`, `-1q`, `+1y`    |
| `mode`    | `active` (the default), `tab`, `split` or `window`                                               |
| `notelet` | with `journal`: create a [notelet](/notelets) of that type instead of opening the period's note  |

The note is created if it does not exist, with the journal's [questions](/questions) asked. With
`type`, if more than one journal of that length covers the date, you are asked which.

A link that cannot be followed shows a notice saying why.

To put a link to a journal note inside a note, use **Insert link to journal note** instead — see
[Commands](/commands#insert-link-to-journal-note).

## Examples

### Next week's note in a new tab

With one weekly journal, **Folder** `week`, following this link on 13 September 2026 creates
`week/2026-W39.md` and opens it in a new tab:

```text
obsidian://journals?type=week&date=+1w&mode=tab
```

The `+` needs no escaping: Obsidian passes it through as written.

### Elsewhere in the manual

- [A notelet from a link](/notelets#a-notelet-from-a-link) — `notelet` creating a numbered notelet.
- [A journal with a start and an end](/journals#a-journal-with-a-start-and-an-end) — links for dates
  outside a journal's timeline.
