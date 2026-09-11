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
  notesInRange(selector: JournalSelector, range: DateRange): Promise<readonly JournalNote[]>;
  existingNotes(selector: JournalSelector, range?: DateRange): Promise<readonly ExistingJournalNote[]>;
  journalOf(file: TFile): Promise<ExistingJournalNote | null>;
  noteletOf(file: TFile): Promise<NoteletNote | null>;
  noteletsFor(
    selector: JournalSelector,
    date: DateInput,
    options?: { readonly type?: string },
  ): Promise<readonly NoteletNote[]>;
  noteletsInRange(
    selector: JournalSelector,
    range: DateRange,
    options?: { readonly type?: string },
  ): Promise<readonly NoteletNote[]>;

  ensureNote(selector: JournalSelector, date: DateInput, options?: EnsureNoteOptions): Promise<EnsureResult>;
  openNote(selector: JournalSelector, date: DateInput, options?: OpenNoteOptions): Promise<EnsureResult>;
  createNotelet(
    selector: JournalSelector,
    date: DateInput,
    type: string,
    options?: CreateNoteletOptions,
  ): Promise<NoteletNote>;
  openNotelet(notelet: NoteletNote, options?: OpenNoteletOptions): Promise<void>;

  on<K extends keyof JournalsApiEvents>(event: K, handler: JournalsApiEvents[K]): () => void;
}
```

```ts
// Which journals exist, and what cadence do they write?
const dailies = await journals.listJournals({ writeType: "day" });
//  [{ name: "Work Daily", shelf: "Work", write: { type: "day" }, notelets: [] }, …]

// Does today's note exist, and where would it go?
const [today] = await journals.notesFor("Work Daily", "today");
//  { journal, date, displayDate, endDate, path, file }
if (today?.file) await this.app.vault.process(today.file, (text) => `${text}\n- captured`);

// Create it if it is not there. Idempotent.
const { note, created } = await journals.ensureNote("Work Daily", "today");

// A whole window at once, rather than one call per cell.
const year = await journals.notesInRange("Work Daily", { from: "2026-01-01", to: "2026-12-31" });
//  one entry per period, on disk or not — 365 of them, one call

// Only what is on disk. Omit the range for every note the journal has ever written.
const written = await journals.existingNotes("Work Daily", { from: "2026-01-01", to: "2026-12-31" });
//  [{ journal, date, displayDate, endDate, path, file }, …] — path and file always set

// Which journal does the open note belong to?
const current = await journals.journalOf(this.app.workspace.getActiveFile());
if (current) console.log(current.journal, current.date);

// React to changes.
const off = journals.on("noteAdded", ({ journal, date, path }) => {
  /* … */
});

// What notelet types does this journal offer?
const [journal] = await journals.listJournals("Work Weekly");
//  { name, shelf, write, notelets: ["1o1", "Meeting"] }

// What notelets sit on this week?
const meetings = await journals.noteletsFor("Work Weekly", "today", { type: "Meeting" });
//  [{ journal, type, date, displayDate, endDate, path, file, counter }, …]

// Every notelet in a window, not just one period's.
const quarter = await journals.noteletsInRange(
  "Work Weekly",
  { from: "2026-07-01", to: "2026-09-30" },
  { type: "Meeting" },
);

// Create one, without stealing the user's pane.
const notelet = await journals.createNotelet("Work Weekly", "today", "Meeting");

// Show it. The default mode reuses a pane that already holds the note, in the focused window.
await journals.openNotelet(notelet);

// An explicit mode is a request for a new pane, and never reuses.
await journals.openNotelet(notelet, { openMode: "split" });

// Which notelet is this file, if any? journalOf stays period-note only.
const held = await journals.noteletOf(this.app.workspace.getActiveFile());
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

## Ranges

A `DateRange` is `{ from, to }`, both `DateInput`, and **both ends are
inclusive**. `from` later than `to` returns nothing rather than failing.

The window is matched by **overlap, on the journal's own periods** — not by
whether a period's `date` falls between the two bounds. A monthly journal read
from the 15th of January still reports January:

```ts
await journals.notesInRange("Monthly", { from: "2026-01-15", to: "2026-02-15" });
//  [{ date: "2026-01-01", … }, { date: "2026-02-01", … }]
```

Each period appears **once**, whatever its length. Do not iterate days and call
`notesFor` per day: a weekly journal answers the same period seven times and a
monthly one thirty, which is what these calls exist to replace.

Which one to reach for:

| you want                               | call                                |
| -------------------------------------- | ----------------------------------- |
| a cell per period, empty ones included | `notesInRange`                      |
| only the notes that exist              | `existingNotes(selector, range)`    |
| every note a journal has written       | `existingNotes(selector)`, no range |

`existingNotes` returns `ExistingJournalNote`, so `path` and `file` are always
set — no null checks, and nothing to filter. It reads a sorted index, so it
costs what it returns and not what the window spans: a 90-year window over a
journal with eleven notes does eleven notes of work.

`notesInRange` materialises every period in the window, so it costs the window.
A period with no note pays a path-template render to answer _where the note
would go_; nothing is created, nothing is asked, and no file is touched. There
is no cap — bound the window to what you are about to draw, or generate the
empty cells yourself from `date` and `endDate` and use `existingNotes` to fill
them in.

Results are grouped **by journal**, in the order the selector matches them, and
ordered by date within each journal. A multi-journal read is not interleaved by
date.

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

## Notelets

A notelet is an extra note attached to a period, of a type the journal defines. A period has one
period note and any number of notelets.

- **`journalOf` never returns a notelet, and `noteAdded`/`noteRemoved` never carry one.**
  Answering "what journal thing is this file?" is two calls. This is deliberate: a consumer
  written before notelets existed must keep receiving exactly what it receives today.
- **`path` and `file` are non-nullable on `NoteletNote`**, unlike `JournalNote`'s. A notelet's
  path is not a function of its identity — the counter, the prompt answers and the auto-suffix
  all feed it — so there is no "where it would go". It exists, or there is nothing to describe.
- **`date`, `displayDate` and `endDate` are the period's**, derived from the anchor. A notelet
  stores none of them. Correlate a notelet to its period note on `date`.
- **Types are named, not identified.** `JournalInfo.notelets` lists the names `noteletsFor` and
  `createNotelet` take. A rename breaks a hardcoded name exactly as it breaks a hardcoded journal
  name — see [Renames](#renames).
- **`options.type` is matched per journal.** Two journals may each own a type called "1o1", so a
  selector spanning both returns notelets from each.
- **`createNotelet` always creates.** There is no ensure semantics: several notelets per period is
  the point, so calling it twice gives two notes.
- **`createNotelet` does not open** unless you pass `openMode`.
- **A type can ask before it creates.** Its own _Confirm creating notelets_ setting is separate
  from the journal's, which guards period notes only. The dialog opens for an API call the way
  the type's questions do; pass `{ confirm: false }` for a call that must not raise one, or
  `{ prompt: false }`, which suppresses both.
- **Results are grouped by journal, not globally sorted.** `noteletsFor` builds one listing per
  matching journal, so a multi-journal selector's results appear in the order journals were
  matched; the type/counter/filename ordering applies only within each journal's group.
  `noteletsInRange` groups the same way, by journal and then by period.
- **`noteletsInRange` reads a window** under the same rules as
  [the period reads](#ranges): both ends inclusive, matched by overlap on the journal's own
  periods, each period once. It has no unbounded form — `noteletsFor` answers a single period,
  and a notelet only exists where one was created.

## Errors

Failures reject with an error carrying a stable string `code`. Absence is not a
failure — no note for a period is `file: null`.

| code                     | meaning                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `journal-not-found`      | no journal by that name — usually a stale stored reference                |
| `no-matching-journal`    | the selector matched no journal                                           |
| `invalid-date`           | the `DateInput` could not be read                                         |
| `unmappable-date`        | the journal's configuration cannot place that date in a period            |
| `outside-timeline`       | the period falls outside the journal's timeline, and no note exists there |
| `notelet-type-not-found` | the journal owns no notelet type by that name                             |
| `creation-failed`        | the note could not be created or written                                  |
| `open-failed`            | the note could not be opened                                              |
| `aborted`                | the user dismissed the confirmation prompt or the journal picker          |
| `prompts-required`       | the journal has creation prompts and `prompt: false` was passed           |
| `plugin-unloaded`        | Journals was unloaded while the call was in flight                        |

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
`noteAdded`, `noteRemoved`, `noteletAdded`, `noteletRemoved`. Note and notelet
events carry `path` rather than a `TFile`, because on removal the file is
already gone.

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

If the journal has creation prompts and the note does not exist yet, an
unanswered prompt's variable renders as the literal placeholder `(unanswered)`
in `path` — the same value the note would actually be created with. This is
read-only, like everything else in this section.

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
- **A journal can also ask its own creation questions.** This is separate from
  _Confirm creation_ above: a journal can define questions (a mood, a rating, a
  free-text field) that it asks when a note is created, and the answers land in
  the note's frontmatter. `ensureNote` and `openNote` ask them by default —
  `prompt` defaults to `true` — because in practice these calls are
  user-triggered (a QuickAdd macro, a Templater script, a command), so asking
  is what makes the call behave like clicking the calendar cell would. Pass
  `{ prompt: false }` for a call that must not block on a modal — a backfill, a
  background sync — and a journal that cannot proceed without an answer fails
  with `prompts-required` instead of hanging one open.

  **There is no way to supply answers programmatically.** The API exposes
  selectors and notes, never journal configuration, so a caller has no way to
  discover that a journal even has a `mood` prompt, let alone that it is a
  `select` with values `😀`/`😐`. An answers bag with no way to discover what
  it expects would be unusable. A discovery API — reading a journal's prompts
  before calling — is a separate, additive change this one does not attempt.

- **Custom journals exist.** A journal can write every N days/weeks/months rather
  than on a calendar boundary. They appear as `write.type === "custom"` with
  `every` and `duration`, and they are reachable by name — no `writeType` maps
  onto them.

## Coming from Journals 2.x internals

Journals 2.x had no API. Integrators read fields straight off the plugin object —
`app.plugins.getPlugin("journals").journals`, `.calendarSettings`, `.index` — and
several shipped plugins did. **3.0.0 removed all of them.** The plugin now builds
its services in a private container and exposes exactly one public member, `api`.

Nothing throws. `plugin.journals` is `undefined`, so integration code written with
optional chaining takes its fallback branch and the feature quietly stops working
— usually presenting as "Journals is not installed" to a user who has it
installed and configured.

| Journals 2.x                              | now                                            | note                                                                                |
| ----------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `plugin.journals`                         | `listJournals()`                               | async, and `JournalInfo` is a summary, not the journal object                       |
| `plugin.journals.find(j => j.type === …)` | `listJournals({ writeType: … })`               | returns **all** matches; there was never only one                                   |
| `plugin.getJournal(name)`                 | `journalInfo(name)`                            | `null` rather than `undefined` when absent                                          |
| `plugin.getJournalConfig(name)`           | —                                              | configuration is deliberately not exposed; see below                                |
| `plugin.shelves`, `getShelfJournals`      | `listJournals({ shelf })`, `JournalInfo.shelf` |                                                                                     |
| `plugin.index`                            | `notesFor`, `journalOf`                        | a range read is [#380](https://github.com/srg-kostyrko/obsidian-journal/issues/380) |
| `plugin.calendarSettings`                 | —                                              | see _the week grid_ below                                                           |
| `openDateInJournal(...)`                  | `openNote(selector, date)`                     |                                                                                     |
| `plugin.notesManager`, `.appManager`      | —                                              | internal seams, never an integration surface                                        |

**Journal configuration has no replacement, on purpose.** `nameTemplate`,
`folder`, `dateFormat` and `templates` were only ever read in order to
reconstruct a note's path by hand, and doing that correctly means reimplementing
folder variables, the week grid and custom-interval anchoring. Ask for the path
instead: `notesFor(selector, date)` returns `path` for every matched journal,
whether or not the note exists yet, and `ensureNote` creates it with the
templates, prompts and `journal` / `journal-date` frontmatter that make it a
journal note. A note written any other way is not one — nothing in the plugin
will recognise it.

**The week grid.** `calendarSettings.dow` was a number with `-1` meaning "follow
the locale". It is now a mode — either `locale`, or a `dow`/`doy` pair — so there
is no single number to hand back, and reading `dow` without `doy` was already
wrong: `doy` decides which week is week 1, and therefore what a `gggg-[W]ww`
filename resolves to.

Do not reach for `window.moment` either. The user's grid is installed on a
private locale, and the global locale receives it **only** when _Apply globally_
is on (`Calendar.applyWeekConfig`); with it off the global locale is actively
reset to the vault's own week. So `window.moment().startOf("week")` answers for a
different grid than the journal does, on the default setting.

Take the boundaries from the note instead. `JournalNote.date` is the period's
first day under the user's grid and `endDate` its last, so walking a week journal
by `endDate + 1 day` stays aligned without knowing `dow` at all, and
`displayDate` carries the `doy`-dependent answer that `dow` alone cannot give.
See [`date` vs `displayDate`](#date-vs-displaydate).
