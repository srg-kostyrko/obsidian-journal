# Local REST API

Install [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) 5.1 or later
and enable it. Journals adds its own routes to that plugin's server — there is nothing to turn on
or configure in Journals itself. The host plugin is desktop-only, so these routes are too.

Every request needs the host's own `Authorization: Bearer <your-api-key>` header, and its server
uses a self-signed certificate on the default HTTPS port, 27124 — see the host's own
[README](https://github.com/coddingtonbear/obsidian-local-rest-api) for the API key, the
certificate, and its plain `/vault/` routes that Journals' own routes redirect into.

## Security

The host's API key already lets a caller read and write every file in the vault. These routes add
no access beyond that — they only save a caller from working out a journal's note paths itself,
by finding a note from a journal's name and a date instead.

## Routes

| Method | Path                               | Does                                                                           |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/journals/`                       | `{ journals }` — every journal's info                                          |
| GET    | `/journals/<name>/`                | one journal's info: its write type, shelf, notelet types and questions         |
| GET    | `/journals/<name>/notes`           | `{ notes, notelets }` for the journal, filtered by `from`, `to` and `type`     |
| POST   | `/journals/<name>/notes/<date>`    | creates (or finds) the period's note, answering its questions from the body    |
| POST   | `/journals/<name>/notelets/<date>` | creates a notelet of a given type in the period                                |
| GET    | `/journals/<name>/<date>/…`        | redirects to the host's own `/vault/` route for the note, 404 if there is none |
| POST   | `/journals/<name>/<date>/…`        | creates the note first, then redirects                                         |
| PATCH  | `/journals/<name>/<date>/…`        | creates the note first, then redirects                                         |
| DELETE | `/journals/<name>/<date>/…`        | redirects to the host's own delete route, 404 if there is none                 |
| PUT    | `/journals/<name>/<date>/…`        | creates the note first, then redirects (a heading or block target)             |
| PUT    | `/journals/<name>/<date>`          | replaces the note's whole content — answered here, not redirected (see below)  |

`<name>` is a journal's name and `<date>` is `today`, `YYYY-MM-DD`, or a shift such as `+1w` or
`-3d` — the same syntax `obsidian://journals` links use; see [Links](/reference/links) for the
full table. A name matching several journals is not possible: a route always names one journal.

`GET /journals/<name>/notes` takes `from` and `to` in the same `<date>` syntax as above — `today`,
`YYYY-MM-DD`, or a shift such as `+1w` — and an optional `type` that narrows the notelets to one
type. Give `from` and `to` together, or leave both off — one without
the other answers `400 invalid-request`. Without them, the route answers every note the journal has
ever written, with an empty `notelets` list — it never lists notelets on its own, only alongside a
range. With `from` and `to`, it answers the notes and notelets that exist in periods the window
overlaps; a period with no note or notelet is left out, not listed empty.

## Following the redirect

`GET`, `POST`, `PATCH`, `DELETE`, and a `PUT` carrying a heading or block target, on
`/journals/<name>/<date>/…` answer with a `307` to the host's own `/vault/<path>/…` route — the
same route you would reach by working out the note's path yourself, including the host's own
targeting of a heading, a block or frontmatter by appending it to the path. A client has to follow
the redirect and keep sending the `Authorization` header, which `curl -L` does on a same-host
redirect like this one. The request's query string is passed through to the host unchanged, so the
host's own parameters — `?permanent=true` on a `DELETE`, for one — still apply. `POST`, `PATCH`
and a targeted `PUT` create the note first before redirecting — without answers, so on a journal
whose questions cannot be skipped they answer `409 prompts-required` instead (see
[Journals with questions](#journals-with-questions)); `GET` and `DELETE` never create
anything — with no note there, they answer `404 note-not-found` instead of redirecting. A `PUT`
with no target is not part of this family at all — see the next section.

## Whole-file PUT is not redirected

`PUT /journals/<name>/<date>` with no suffix is answered by Journals itself, not redirected. The
host's own whole-file `PUT /vault/<path>` would replace the frontmatter along with the rest of the
note, taking the properties that tie it to its journal with it — so Journals creates the note if
needed and writes the body itself, adding its own journal properties on top of whatever
frontmatter the body carries. It answers `204` with no body.

- Frontmatter in the request body keeps its values; Journals' journal properties (`journal-date`
  and so on) are added on top of it. The YAML itself is written back out fresh, so comments,
  quoting and flow-style lists in it are not preserved.
- Answer properties saved from [questions](/questions) come only from the request body — a PUT
  does not restore ones an earlier version of the note had that the new body leaves out.
- A custom interval journal's end date cannot be changed this way; the note keeps the span it was
  created with.
- If the note's name or folder uses an answer, the name stays as it is even when the new body
  drops that property — a PUT never renames or moves the note.
- An empty body clears the note down to its frontmatter.
- Frontmatter that is not valid YAML answers `400 invalid-request` and writes nothing: an existing
  note is left untouched, and a missing one is not created.

Send the body as `Content-Type: text/markdown`.

## Journals with questions

A journal or notelet type with [questions](/questions) needs its answers up front, keyed by each
question's variable name: `POST /journals/<name>/notes/<date>` and
`POST /journals/<name>/notelets/<date>` both take `{ "answers": { "<variable>": <value> } }` in the
body. A write through the redirect family cannot answer questions — creating the note that way on
a journal whose questions cannot be skipped fails with `409 prompts-required`, naming the notes
route to use instead. `GET /journals/<name>/` lists each question and notelet type's questions, so
a caller can build an answers object without reading the journal's settings.

## Errors

Every error answers `{ code, message }`, with `journal` when one journal is implicated and
`issues` for `invalid-answers`.

| Code                     | Status | When                                                                                                                                      |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `journal-not-found`      | 404    | `<name>` does not match a journal                                                                                                         |
| `note-not-found`         | 404    | the redirect family's `GET`/`DELETE` found no note for the period, or a whole-file `PUT`'s note vanished between its create and its write |
| `notelet-type-not-found` | 404    | the notelet `type` does not belong to the journal                                                                                         |
| `outside-timeline`       | 404    | a write maps the date to a period, but one outside the journal's timeline                                                                 |
| `invalid-date`           | 400    | `<date>` could not be parsed                                                                                                              |
| `invalid-answers`        | 400    | the answers object failed a question — `issues` lists every problem                                                                       |
| `invalid-request`        | 400    | a malformed request the routes themselves reject — see below                                                                              |
| `unmappable-date`        | 422    | a write's date cannot be placed in any period of the journal at all                                                                       |
| `prompts-required`       | 409    | a write through the redirect family hit a journal that needs answers                                                                      |

`outside-timeline` and `unmappable-date` come only from a route that creates a note — the notes
and notelets routes, and `POST`/`PATCH`/`PUT` on the redirect family. `GET` and `DELETE` there
never create anything, so the same two situations both read as a plain `note-not-found`.

`invalid-request` covers a body the route cannot read (missing `type` on a notelet, a malformed
percent-encoded path suffix, a PUT whose frontmatter fails to parse) and is not one `JournalsApi`
itself ever throws. Anything else — including a write that fails after the note was created —
answers `500`.

## Examples

### List journals and read one's info

```sh
curl -k -H "Authorization: Bearer <your-api-key>" \
  https://127.0.0.1:27124/journals/
```

```json
{
  "journals": [
    {
      "name": "work",
      "shelf": null,
      "write": { "type": "day" },
      "notelets": ["Meeting"],
      "prompts": [],
      "noteletTypes": [{ "name": "Meeting", "prompts": [] }]
    }
  ]
}
```

### Create a note, answering its questions

::: v-pre

A daily journal `mood`, folder `mood`, note name template `{{date}} {{mood}}`, with one required
question — variable `mood`:

:::

```sh
curl -k -X POST -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"answers": {"mood": "great"}}' \
  https://127.0.0.1:27124/journals/mood/notes/2027-07-16
```

`201` with `{ "created": true, "path": "mood/2027-07-16 great.md", ... }` — the answer renders
into the note's name, the same as it would into its content or a property. A later call for the
same day answers `200` with `"created": false` and the existing note. Two such calls arriving at
once for the same day never create two notes, even when their answers differ — one wins the
creation and the other reuses its result.

### Read a note through the redirect

A daily journal `work`, folder `work`:

```sh
curl -k -L -H "Authorization: Bearer <your-api-key>" \
  https://127.0.0.1:27124/journals/work/2027-07-10/
```

Without `-L`, the first response is a bare `307` with `Location: /vault/work/2027-07-10.md`.

### Replace a note's whole content

```sh
curl -k -X PUT -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: text/markdown" \
  --data-binary $'# Replaced\n\nwritten over REST\n' \
  https://127.0.0.1:27124/journals/work/2027-07-11/
```

Answers `204`. `work/2027-07-11.md` keeps its `journal: work` and `journal-date: 2027-07-11`
properties; everything else in the note is exactly the body sent.

### Append under a heading

Raw-content mode: the target rides in the URL, the operation in a header, and the body is the text
to insert — nothing JSON-escaped.

```sh
curl -k -L -X PATCH -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: text/markdown" -H "Operation: append" \
  --data-binary "second entry" \
  https://127.0.0.1:27124/journals/work/2027-07-14/heading/Log
```

Creates `work/2027-07-14.md` first if it does not exist yet, then appends `second entry` under its
`## Log` heading through the host's `/vault/` route.

### Delete a note

```sh
curl -k -L -X DELETE -H "Authorization: Bearer <your-api-key>" \
  https://127.0.0.1:27124/journals/work/2027-07-11/
```

`404 note-not-found` if `work` has no note for that day; the redirect family never creates one for
a read or a delete.

### Create a notelet

::: v-pre

The `work` journal has a notelet type `Meeting`, folder `work/meetings`, note name template
`{{date}} Meeting {{notelet_index}}`, numbered:

:::

```sh
curl -k -X POST -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"type": "Meeting"}' \
  https://127.0.0.1:27124/journals/work/notelets/2027-07-17
```

`201` with the created notelet:

```json
{
  "journal": "work",
  "type": "Meeting",
  "date": "2027-07-17",
  "displayDate": "2027-07-17",
  "endDate": "2027-07-17",
  "path": "work/meetings/2027-07-17 Meeting 1.md",
  "counter": 1
}
```

`counter` is `null` for a type with no counter, and otherwise orders siblings within the period.

## MCP tools

The host also runs a [Model Context Protocol](https://modelcontextprotocol.io/) server, at `/mcp/`
on the same port, for MCP-compatible agents rather than scripts. It needs host version 5.1 or
later. Journals adds four tools to that server automatically — there is nothing to configure.
Connect a client the way the host's own README describes, under
[MCP clients](https://github.com/coddingtonbear/obsidian-local-rest-api#mcp-clients): the endpoint,
the API key header, and example configs for Claude Code, Claude Desktop, Cursor and other clients.
If another plugin already registered a tool under one of these names, Journals' tool of that name
is skipped and a warning is logged — the REST routes above, and the host's own tools, keep working
regardless.

| Tool                     | Arguments                                             | Returns                                                               | Kind           |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------- | -------------- |
| `journal_list`           | none                                                  | `{ journals }`, the same info as [`GET /journals/`](#routes)          | Read-only      |
| `journal_notes`          | `journal`; `from`; `to` (optional); `type` (optional) | `{ notes, notelets }`, the same shape as `GET /journals/<name>/notes` | Read-only      |
| `journal_note_ensure`    | `journal`; `date`; `answers` (optional)               | the note, plus whether it was just created                            | Creates a note |
| `journal_notelet_create` | `journal`; `date`; `type`; `answers` (optional)       | the new notelet                                                       | Creates a note |

`journal`, `date`, `from` and `to` take the same values as the routes above: a date is `today`,
`YYYY-MM-DD`, or a shift such as `+1w`, and a single day also finds the week, month or other period
note that contains it. `to` defaults to `from` when left out, so `journal_notes` covers one day or a
range with the same tool. `answers` follows the same rules as
[Journals with questions](#journals-with-questions) — keyed by each question's variable name.

`journal_note_ensure` reuses an existing note for the day instead of making a second one, the same
as `POST /journals/<name>/notes/<date>`. `journal_notelet_create` has no such reuse: every call
creates another notelet, so do not retry a call that already succeeded.

These tools only ever return vault paths — reading or writing a note's content goes through the
host's own `vault_read`, `vault_patch`, `vault_append` and the rest of its `vault_*` tools, the same
way a REST client follows the redirect above.

A failed call raises a tool error whose text is the same JSON body a REST error answers — see
[Errors](#errors).

## What it does not do

- No journal-type selector — `type=day` the way an `obsidian://journals` link accepts is not a
  thing here; every route names one journal.
- A name matching several journals cannot happen: `<name>` is always exactly one journal, so there
  is nothing to pick between.
