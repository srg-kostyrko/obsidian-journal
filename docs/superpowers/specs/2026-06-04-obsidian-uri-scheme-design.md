# Obsidian URI scheme for journal entries (#85)

## Problem

The plugin can only open or create journal entries from inside Obsidian — a
command, a ribbon icon, a calendar click. There is no way to drive it from
outside: a shortcut, a script, another app, or an `obsidian://` link. Users who
automate their notes (the issue reporter, and follow-up commenters) want a URI
that behaves like Obsidian's built-in `obsidian://daily`: hand it a journal and a
date and it opens the entry, creating it with the journal's template,
frontmatter, and navigation when the entry does not yet exist.

Externally created notes (e.g. via the generic `obsidian://new`) bypass the
plugin entirely, so they get no journal connection and no template. A
plugin-owned URI closes that gap.

## Scope

In scope: a single open-or-create action. The URI resolves a journal entry and
opens it, creating it first if it is missing — identical in effect to running the
journal's open command.

Out of scope for this iteration (raised in the issue thread, deferred): creating
in the background without opening, appending content to an entry, and
open-only-if-exists. The design leaves room for these as future actions but does
not build them.

## Behavior

A new protocol action, `obsidian://journals`, opens a journal entry. Its query
parameters:

- `journal` — the exact name of a journal to open. Either this or `type` must be
  present; if both are given, `journal` is used and `type` is ignored.
- `type` — a journal period kind: `day`, `week`, `month`, `quarter`, or `year`.
  Selects every journal of that kind. When more than one journal matches and more
  than one covers the requested date, the user is asked which to open (the same
  picker the open commands use).
- `date` — which entry within the journal. Optional; defaults to today.
  Accepted forms:
  - an ISO date, `YYYY-MM-DD`;
  - the keyword `today`;
  - a relative offset from today: a sign, a number, and a unit —
    `d` (day), `w` (week), `m` (month), `q` (quarter), `y` (year). For example
    `+1d` is tomorrow, `-2w` is two weeks ago.

  For week/month/quarter/year journals, any date inside the period selects that
  period's entry.

- `mode` — where the entry opens: `active` (current pane, default), `tab`,
  `split`, or `window`.

`vault` is consumed by Obsidian to route to the correct vault and is not handled
by the plugin.

When the entry already exists it is opened. When it does not, it is created with
the journal's template, frontmatter, and navigation — the same creation path the
open command uses — and then opened.

## Errors

Every failure surfaces a notice and otherwise does nothing (the entry is not
created, nothing is opened):

- Neither `journal` nor `type` is provided.
- `journal` names a journal that does not exist.
- `type` is not one of the recognised period kinds.
- `date` cannot be parsed.
- `mode` is not one of the recognised open modes.
- No journal covers the requested date (e.g. the date is before the journal's
  timeline starts).

Dismissing the journal picker cancels silently with no notice.

## Acceptance scenarios

- A URI naming a journal and an ISO date opens that journal's entry for that date.
- A URI naming a journal with no date opens that journal's entry for today.
- A URI naming a journal whose entry does not exist creates it with the template
  and navigation applied, then opens it.
- A URI with a relative date of `+1d` opens tomorrow's entry.
- A URI with `type=week` and a date inside a week opens that week's entry.
- A URI with a `type` matched by several journals that all cover the date prompts
  the user to choose which journal to open.
- A URI with `mode=tab` opens the entry in a new tab.
- A URI naming a journal that does not exist shows a notice and opens nothing.
- A URI with an unparseable date shows a notice and opens nothing.
- A URI naming a date no journal covers shows a notice and opens nothing.
- Dismissing the journal picker opens nothing and shows no notice.

## Design notes

Two units are added; the dispatch reuses the existing open flow unchanged.

**Host — protocol registration.** A `UriService` under
`src/infrastructure/host/uri/` wraps `Plugin.registerObsidianProtocolHandler`
(Obsidian removes the handler on unload). It mirrors the existing `commands/`
host layout: `index.ts`, `types.ts`, `internal/uri-service.ts`, and a
`testing.ts` fake. A small `NoticeService` is also added to the host
(`new Notice` wrapper plus a fake) so the dispatcher can report errors without
importing `obsidian`, keeping it unit-testable through black-box assertions;
`main.ts`'s existing raw `new Notice` can adopt it later but is not changed here.

**Journals — parse and dispatch.** A new sub-feature `src/journals/uri/` (it has
its own `module.ts`):

- `parse-request.ts` — a pure function turning the raw parameter record into a
  validated request or a typed error. No Obsidian dependency. Holds the date
  grammar (ISO / `today` / relative offset → `CalendarDate`), the `type`/`mode`
  enumerations, and the `journal`-wins-over-`type` rule.
- `errors.ts` — the `UriError` subclasses for each parse failure
  (missing target, invalid date, invalid mode, unknown period kind).
- `journal-uri-handler.ts` — a service that, on `initialize()`, registers the
  `journals` action through `UriService`. Per invocation it parses the request,
  resolves candidate journals and a single period anchor, then invokes the
  existing `OpenDateFlow` with `existingOnly: false`. Resolution mirrors
  `DynamicCommandRegistry`: for `journal`, the candidate set is that one journal
  and the anchor is `CycleService.anchorOf(name, date)`; for `type`, the
  candidates are all journals of that kind, the anchor is computed from a
  representative, and all candidates are passed so `OpenDateFlow` filters by
  timeline coverage and shows the picker when several remain. Errors from parsing
  and from the flow (`NoApplicableJournals`) become notices via `NoticeService`;
  `UserAborted` is swallowed.

`OpenDateFlow` already performs template creation, frontmatter, navigation,
multi-journal disambiguation, and opening, so no flow changes are required.

The handler is wired in `main.ts` alongside the other initialised services
(`container.resolve(JournalUriHandler).initialize()`).

Error notice text is added as new `m.uri_*` paraglide messages in
`messages/en.json`.
