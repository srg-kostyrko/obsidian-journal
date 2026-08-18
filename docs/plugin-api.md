# Plugin API

For developers writing an Obsidian plugin that needs to read or create Journals
notes. If you are looking for `obsidian://` deep links instead, see the URI
section of [`README.md`](../README.md).

## Getting the API

```sh
npm install obsidian-journals-api
```

The package ships the TypeScript surface and a locator. It contains no domain
logic, so it cannot drift from the plugin.

```ts
import { getJournalsApi } from "obsidian-journals-api";

const journals = getJournalsApi(this.app);
if (!journals) return; // not installed, or not enabled
```

**Call it at the point of use, not at load.** There is no readiness event, and
reloading the plugin replaces the object, so a cached reference goes stale. Every
method is async and waits internally for whatever it needs — you never have to
schedule around Journals' startup.

## There is no "the" daily note

This is the one assumption worth meeting first. Unlike Daily Notes or Periodic
Notes, a vault can hold **several journals of the same write type** — a personal
daily and a work daily, two weeklies on different shelves. So:

- **Reads fan out.** `notesFor` returns an array: empty, one, or several.
- **Writes resolve to one.** `ensureNote` and `openNote` produce a single note,
  showing the journal picker when your selector matches more than one — exactly
  as clicking a calendar cell does.

## The surface

```ts
interface JournalsApi {
  readonly apiVersion: number;

  listJournals(selector?: JournalSelector): Promise<readonly JournalInfo[]>;
  journalInfo(name: string): Promise<JournalInfo | null>;

  notesFor(selector: JournalSelector, date: DateInput): Promise<readonly JournalNote[]>;
  journalOf(file: TFile): Promise<ExistingJournalNote | null>;

  ensureNote(selector: JournalSelector, date: DateInput, options?: EnsureNoteOptions): Promise<EnsureResult>;
  openNote(selector: JournalSelector, date: DateInput, options?: OpenNoteOptions): Promise<EnsureResult>;

  on<K extends keyof JournalsApiEvents>(event: K, handler: JournalsApiEvents[K]): () => void;
}
```

```ts
// Which journals exist, and what cadence do they write?
const dailies = await journals.listJournals({ writeType: "day" });
//  [{ name: "Work Daily", shelf: "Work", write: { type: "day" } }, …]

// Does today's note exist, and where would it go?
const [today] = await journals.notesFor("Work Daily", "today");
//  { journal, date, displayDate, endDate, path, file }
if (today?.file) await this.app.vault.process(today.file, (text) => `${text}\n- captured`);

// Create it if it is not there. Idempotent.
const { note, created } = await journals.ensureNote("Work Daily", "today");

// Which journal does the open note belong to?
const current = await journals.journalOf(this.app.workspace.getActiveFile());
if (current) console.log(current.journal, current.date);

// React to changes.
const off = journals.on("noteAdded", ({ journal, date, path }) => {
  /* … */
});
```

## Selectors

A `JournalSelector` picks which journals a call applies to. A bare string is
shorthand for one journal by name; the object form ANDs its fields; an empty
selector matches every journal.

```ts
"Work Daily"                          // that journal
{ journal: "Work Daily" }             // the same thing
{ writeType: "week" }                 // every weekly journal
{ shelf: "Work" }                     // everything on the Work shelf
{ shelf: "Work", writeType: "day" }   // both conditions
{ shelf: null }                       // journals on no shelf
{}                                    // every journal
```

`shelf` has three states: `undefined` does not filter, `null` means "on no
shelf", and a string names one. The value you read back from
`JournalInfo.shelf` can be passed straight back in.

A selector matching nothing is `no-matching-journal`; a selector naming a
journal that does not exist is `journal-not-found`. Those are different
failures, and the second usually means a stored reference went stale — see
[Renames](#renames).

## Dates

`DateInput` accepts:

| form                                                          | example          |
| ------------------------------------------------------------- | ---------------- |
| an ISO date string — **recommended**                          | `"2026-08-18"`   |
| `"today"`                                                     | `"today"`        |
| a relative shift, the same grammar the `obsidian://` URI uses | `"+1w"`, `"-3d"` |
| a `Date`                                                      | `new Date()`     |
| anything with `toDate()`, such as a moment                    | `moment()`       |

> **Prefer the string form.** A `Date` is a timestamp, not a date. A user in
> UTC+13 calling `notesFor(sel, new Date())` near midnight — or passing a `Date`
> parsed from an ISO string ending in `Z` — lands on the wrong day, and it
> reproduces for their users and not for you. `moment().format("YYYY-MM-DD")` is
> the safe conversion.

The date you pass is **any day inside the period**; the `date` you get back is
**the period's own date**. For a monthly journal:

```ts
const [note] = await journals.notesFor("Monthly", "2026-08-18");
note.date; // "2026-08-01"
```

## `date` vs `displayDate`

Every returned note carries three dates, all `"YYYY-MM-DD"`:

| field         | meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `date`        | the period's first day, and its identity — the note's own `journal-date` |
| `displayDate` | the day the journal formats this period's dates from                     |
| `endDate`     | the period's last day, **inclusive**                                     |

They are equal for every period kind **except a week**. Under ISO, the week
containing 1 January 2026 runs Mon 2025-12-29 → Sun 2026-01-04:

```ts
const [week] = await journals.notesFor("Weekly", "2026-01-01");
week.date; // "2025-12-29"  ← calendar year 2025
week.displayDate; // "2026-01-01"  ← week-year 2026; the note is named 2026-W01
```

**Format from `displayDate`; correlate and store on `date`.** Formatting `date`'s
year would label that note 2025 while the note itself says 2026. You cannot
compute `displayDate` yourself, because it depends on the vault's week
configuration.

`endDate` names a day, not an instant. A containment test needs
`d >= note.date && d <= note.endDate` on date strings, not a timestamp compare.

## Errors

Failures reject with an error carrying a stable string `code`. Absence is not a
failure — no note for a period is `file: null`.

| code                  | meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `journal-not-found`   | no journal by that name — usually a stale stored reference                |
| `no-matching-journal` | the selector matched no journal                                           |
| `invalid-date`        | the `DateInput` could not be read                                         |
| `unmappable-date`     | the journal's configuration cannot place that date in a period            |
| `outside-timeline`    | the period falls outside the journal's timeline, and no note exists there |
| `creation-failed`     | the note could not be created or written                                  |
| `open-failed`         | the note could not be opened                                              |
| `aborted`             | the user dismissed the confirmation prompt or the journal picker          |
| `plugin-unloaded`     | Journals was unloaded while the call was in flight                        |

```ts
try {
  await journals.ensureNote("Work Daily", "today");
} catch (error) {
  switch (error.code) {
    case "aborted":
      return; // the user said no
    case "journal-not-found":
      return this.forgetStoredJournal();
    default:
      console.error("Journals:", error.code, error.message);
  }
}
```

Two rules:

- **Discriminate on `code`, never `instanceof`.** This package ships no error
  constructor, so `instanceof` cannot work across the boundary.
- **Always write a default branch.** The code union is deliberately open — new
  codes are an additive change and will appear without an `apiVersion` bump.

`message` is English developer text and is not translated; it is for your console,
not your user.

## Renames

A journal's **name is its identity**. If you persist one in your own settings, a
user renaming that journal leaves you holding a dangling reference — silently,
since every lookup simply reports `journal-not-found`.

Subscribe and migrate:

```ts
this.register(
  journals.on("journalRenamed", ({ from, to }) => {
    if (this.settings.journal !== from) return;
    this.settings.journal = to;
    void this.saveSettings();
  }),
);
```

`on` returns its unsubscribe function, so it hands straight to `this.register`.

Available events: `journalCreated`, `journalRenamed`, `journalDeleted`,
`noteAdded`, `noteRemoved`. Note events carry `path` rather than a `TFile`,
because on removal the file is already gone.

## `path` is for display, not for writing

`JournalNote.path` tells you where a note is, or where it _would_ be created. It
is safe to show a user. Writing there yourself is not the supported path.

It usually works — Journals reverse-parses the path back to the journal and
adopts the file. But it fails **silently** when the journal's name template is
not invertible, when two journals resolve to the same path, when the date is
outside the timeline, or when the note claims a journal that no longer exists.
It is also asynchronous: write the file and call `notesFor` immediately and you
will see `file: null`, because the index only picks it up once Obsidian re-parses
the frontmatter.

`ensureNote` does all of that deterministically and hands you the connected note.
Use it.

Also: a returned `path` is valid only as of the call. Changing a journal's name
template or folder invalidates every path previously returned — do not cache them.

`path` is `null` when Journals will not place a note there at all: outside the
timeline, or a name template that renders to nothing.

## Versioning

`apiVersion` is an integer, bumped **only** on a breaking change. The package's
major version tracks it, so `obsidian-journals-api@1.x` describes `apiVersion 1`.

| additive — no bump                        | breaking — bumps `apiVersion`           |
| ----------------------------------------- | --------------------------------------- |
| a new method                              | removing or renaming anything           |
| a new optional field on an options object | changing a returned shape               |
| a new readonly field on a returned object | narrowing a parameter type              |
| a new event name                          | changing an existing method's semantics |
| **a new error code**                      |                                         |
| widening a parameter union                |                                         |

Within an `apiVersion`, only additive changes are made. There is no promise to
keep serving version N−1 after a bump.

Adding a method is additive for callers but breaks a test double written as
`implements JournalsApi` — mock the methods you use rather than the whole
interface.

The plugin's own version is not exposed. Read
`app.plugins.plugins.journals.manifest.version` if you need it for a bug report,
and do not branch on it.

## Coming from `obsidian-daily-notes-interface`

That package reads the Daily Notes plugin's settings and reimplements its logic.
This one talks to Journals directly, so the shapes differ — and the difference
that matters is the one at the top of this page: **there is no "the" daily note.**
Every row below returns or acts on a set, not a singleton.

| `obsidian-daily-notes-interface`       | Journals                                    | note                                          |
| -------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| `appHasDailyNotesPluginLoaded()`       | `getJournalsApi(app) !== null`              |                                               |
| `getAllDailyNotes()`                   | `listJournals({ writeType: "day" })`        | returns **journals**, not notes               |
| `getDailyNote(date, all)`              | `notesFor({ writeType: "day" }, date)`      | an **array** — empty, one, or several         |
| `createDailyNote(date)`                | `ensureNote({ writeType: "day" }, date)`    | idempotent; shows the picker if several match |
| `getDateFromFile(file, "day")`         | `journalOf(file)` → `.date`                 | also gives the journal and the period bounds  |
| `getWeeklyNote` / `getMonthlyNote` / … | the same calls with a different `writeType` | one surface instead of six                    |

Two behaviours with no equivalent, worth knowing before you port:

- **Creation may prompt.** If the user set _Confirm creation_ on a journal,
  `ensureNote` shows that prompt. Pass `{ confirm: false }` when you are
  backfilling a range or running in the background, or you will produce one
  dialog per note.
- **Custom journals exist.** A journal can write every N days/weeks/months rather
  than on a calendar boundary. They appear as `write.type === "custom"` with
  `every` and `duration`, and they are reachable by name — no `writeType` maps
  onto them.
