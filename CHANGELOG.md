# Changelog

All notable changes to this project will be documented in this file.

## [3.5.1] - 2026-09-20

### Changed

- No change to the plugin itself. This release ships the same build as 3.5.0 so that the community directory re-runs its automated review against the current source, where the end-to-end test harness no longer sits among the files that review reads.

## [3.5.0] - 2026-09-20

### Features

- Settings sections now link to the manual. A **?** next to a section's heading — on the main settings page and on every journal, notelet type, shelf and view page — opens the part of the manual that explains that section, in your browser.
- **Bulk add** can now read a note's date from where the note sits in your vault. Choose **Note path** under **Read the date from**, and each note is matched against the folder and name the journal itself would give it — so a daily journal filed under `{{date:YYYY}}/{{date:MM-MMM}}` with notes named `{{date:DD-ddd}}` connects `2024/03-Mar/05-Tue.md`, where the title alone says only `05-Tue` and cannot tell which month or year it belongs to. The date format does not apply and is hidden. A note that is not at a path the journal would use is skipped with its own reason, **Not at a path this journal uses**, rather than as having no date — a note moved out of its date folders is not guessed back into them. The option is unavailable, with the reason, for a journal whose note paths cannot be read back into a date, and notelet bulk add does not offer it, since a notelet's path does not say which notelet it is.
- Journals can now set itself up from **Periodic Notes**, **Calendar** and core **Daily notes**. While one of those plugins is enabled and can set up a journal you do not have yet, the main settings page offers **Import…**, and **Maintenance** always shows it too, disabled with a line saying so when there is nothing to import. A preview lists each journal it would create — one per period you use, named **Daily**, **Weekly** and so on, with the plugin's folder, date format and template — and marks the ones you already have, whatever you called them. Each row carries **Create this journal** and **Connect existing notes**; switching off **Create this journal** switches connecting off with it, there being no journal left to connect the notes to, and a journal you already have offers **Connect existing notes** on its own. Several Periodic Notes calendar sets become shelves of the same names. Each shelf name sits above the journals that land on it and can be renamed before you import — give it the name of a shelf you already have and those journals join that shelf rather than a new one. Calendar's week start can be applied as well; it starts switched off once you have weekly notes connected, because applying it moves them to the new weeks, and a week start that cannot keep your current first-week rule is explained instead of offered. The period Periodic Notes opens at startup becomes your startup journal if you have none. Your settings are saved to a snapshot first. Once the journals exist, a second step connects the notes you already have, read from each note's folder and name the way the journal names its own, and lists what it skips and why; a note that fits two journals is connected to neither, and closing the report finishes the import either way, without undoing it. Only enabled plugins are read, and nothing changes until you confirm. Core Daily notes is on in every vault, so it counts toward the offer on the settings page only once you have changed its settings.

- Note names written with a **localized date format** — `{{date:LL}}`, `{{date:ll}}`, `{{date:L}}` and `{{date:l}}`, which render the date the way your language writes it — are now read back, so a note you make yourself in one of those layouts is [auto-attached](https://srg-kostyrko.github.io/obsidian-journal/notes#auto-attach) and **Maintenance** can repair a connected note whose stored date went missing from its path. Epoch timestamps `{{date:X}}` and `{{date:x}}` are read back too, at whatever width they run to — a date before September 2001 is a digit shorter and one before 1970 is negative. **Bulk add** accepts all six in its date format for the same reason. A format is read back under the language Obsidian is running now, so a vault whose notes were named in one language and is then switched to another stops matching them — that was already true of month and weekday names, and localized formats change the order of the parts as well as their words. A timestamp names an instant rather than a day, so a vault synced between machines in different time zones can read one back as the day before or after. A format that also carries a time zone, `Z` or `ZZ`, still cannot be read back.
- Questions can now ask for a **Long text** answer, for journal questions and notelet-type questions alike. It opens in the answer dialog as a box spanning its width instead of a single-line field: **Enter** starts a new line, and **Ctrl+Enter** (**Cmd+Enter** on macOS) creates the note, the same as pressing Create. Written into a note's content, an answer that spans several lines keeps the shape of the template line it starts on — every line stays inside the same quote or callout the first line opened, stays indented under an indented line, and inside a list item a line break continues the item while a blank line starts the next one, counting a numbered list up and repeating a task's checkbox. Blank lines at the start and end of the answer are dropped. Like any other question, it can be saved to a property, kept exactly as typed — but a long text answer, like a yes/no one, can't be part of a note name or folder.
- Questions can now ask for a **Note link**, for journal questions and notelet-type questions alike. The answer dialog suggests every file in your vault as you type, notes first, and a name that matches nothing is kept as a link to a note you have not written yet. A calendar button beside the field links a journal's note instead: pick the period, and the journal too when your vault has more than one, and a note that does not exist yet is linked by its full path so opening it creates the note in the journal's folder. The answer is saved to its property as a list holding one `[[link]]`, which Obsidian shows in backlinks and the graph and updates when the note is renamed, and `{{project}}` writes the link into a template — `!{{project}}` embeds it, since the answer already carries its brackets. A name holding `#`, `^`, `|`, `[` or `]` is refused, and like a yes/no or long text answer a note link can't be part of a note name or folder. **Update Journals on every device that syncs your vault before adding one**: an earlier Journals cannot read the settings this version saves, and shows a settings error instead of starting until it is updated.
- Custom commands, the startup note, `obsidian://journals` links and the public API can now open a journal's note **pinned**, so it stays put instead of being navigated away like an ordinary tab. A pinned open reuses the journal's existing pinned tab — any pinned tab, in any window, already holding one of that journal's own notes — and moves it to the new note rather than pinning a second one; only when the journal has no pinned tab yet does it pin the tab the note opens into. Nothing is ever unpinned. On a command, turn on **Pin the note** under **Open note**; it is not offered on a notelet command, since a notelet is a fresh note every time. The startup note gains its own **Open note** mode alongside **Pin the note**, so the journal you open when Obsidian starts can also stay pinned across the day — with **Different journal on some days**, each journal keeps its own pinned tab. A link takes `pinned=true` or `pinned=false` (the default), and refuses `pinned=true` together with `notelet`.
- The plugin API can now create a note or a notelet whose journal or type asks creation questions without showing the dialog for them: pass `answers`, keyed by each question's `variable`, to `ensureNote`, `openNote` or `createNotelet`, and it skips the questions and the creation confirmation together. A `select` answer is the option's `value`, not its `label`; leaving a question out, or passing `""` or `null`, leaves it unanswered, which is fine unless the question is `required` or feeds the note's name or folder. Anything else wrong — including an answer to a variable the journal or type does not have — fails the whole call with the new `invalid-answers` error code, whose `error.issues` lists every problem at once, and answers are checked even against a note that already exists, so a call fails the same way whatever the vault holds. `JournalInfo` gained `prompts` and `noteletTypes`, each question's `variable`, `type`, whether it is `required` or feeds the path, and its `options` for a `select` — so a caller can discover what an answers bag needs before building one, without Journals exposing full journal configuration. `apiVersion` stays 1 — every addition is additive, and a test double written as `implements JournalsApi` will stop compiling until it gains the new fields. The typed surface for all of this, `pinned` included, ships as [`obsidian-journals-api@1.3.0`](https://www.npmjs.com/package/obsidian-journals-api).
- Journal notes can now be reached from other apps and scripts over the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin (5.1 or later) — install it and Journals adds its own routes to its server, with nothing else to set up. `GET /journals/` lists your journals and `GET /journals/<name>/` gives one journal's write type, notelet types and questions; `GET /journals/<name>/notes` lists its notes and notelets, filtered by a date range and a notelet type. `POST /journals/<name>/notes/<date>` creates or finds a period's note and `POST /journals/<name>/notelets/<date>` creates a notelet, both taking an `answers` object keyed by each question's `variable`, the same as the plugin API — a journal whose questions cannot be skipped answers `409` and names the route that takes them. `<date>` reads `today`, `YYYY-MM-DD` and a shift such as `+1w`, the same as an `obsidian://journals` link. `POST`, `PATCH` and a `PUT` targeting a heading or block create the note first, then redirect to the host's own `/vault/` route for it; `GET` and `DELETE` never create one, answering `404` when there is none. Following the redirect keeps a client on the host's own targeting and patching of a note's content, including under `-L`. A whole-file `PUT` with no target is answered by Journals itself instead of being redirected, since the host's own whole-file replace would drop the properties that tie the note to its journal — it keeps them, adding them to whatever frontmatter the request body carries, and clears the note down to them when the body is empty. See [Local REST API](https://srg-kostyrko.github.io/obsidian-journal/reference/rest-api) in the manual for the full route table, error codes and examples.
- Agents connected to the Local REST API's MCP server can now read and create journal notes and notelets directly, through four tools Journals adds automatically: `journal_list`, `journal_notes`, `journal_note_ensure` and `journal_notelet_create`. `journal_notes` takes a journal and a `from` date with an optional `to`; `journal_note_ensure` and `journal_notelet_create` take a journal, a single date and optional `answers`, and the notelet tool a notelet type. The three note tools return vault paths — read or edit a note's content through the host's own `vault_*` tools. `journal_note_ensure` reuses an existing note for the day rather than making a second one; `journal_notelet_create` has no such reuse, so every call creates another notelet. An error Journals raises reaches the agent as the same JSON body a REST error answers; arguments that fail a tool's schema get the host's own validation message instead. See [MCP tools](https://srg-kostyrko.github.io/obsidian-journal/reference/rest-api#mcp-tools) in the manual.
- A journal's navigation block can now show its previous and next periods on desktop only, so a phone keeps just the current period and its arrows while a computer still shows all three. **Show previous and next periods** is now a choice rather than an on/off switch — **Desktop and mobile**, **Desktop only**, **Mobile only** or **Never** — and a journal that had it on or off keeps showing them everywhere or nowhere. Tablets count as mobile, and the choice follows the kind of device rather than the width of the pane, so a narrow split pane on a computer still shows the neighbors. A single note can override the journal with `adjacent: desktop` or `adjacent: mobile` on the block, alongside the existing `adjacent: true` and `adjacent: false`. If your plugin settings sync between devices, update Journals on each of them: a device still on an earlier version cannot read the new setting and shows a settings error until it is updated.

### Bug Fixes

- The plugin API's `openNote` no longer drops a call that arrives while another call for the same journal and date is still running. Identical calls still share one run, so creating the note never asks twice, but an `openNote` with a different `openMode` or `pinned`, or one made while `ensureNote` was creating the note, used to receive the earlier call's result and never opened anything itself. It now waits for that call and then opens the note as asked.
- Opening a journal note that is already open in a tab you have not switched to since Obsidian started now switches to that tab instead of opening the note a second time. Obsidian restores such tabs without loading them, and the plugin could not tell which note they held.
- A note that lands in your vault in the moment Obsidian finishes starting up is no longer skipped by the journal it matches. The plugin deliberately ignores the notes Obsidian replays to it while the vault loads — those are your existing files, not new ones — but it started watching for real ones a fraction of a second too late, so a note arriving from sync, or written by another application, in that gap reached nobody. Nothing revisits a note once it has arrived, so the miss was permanent: the note stayed unconnected through every later restart, and only renaming it into place or using **Connect note to a journal** would adopt it. Notes arriving at any other time were never affected, and the notes already in your vault are still left alone at startup.
- Weekly notes named with the week-year tokens `gggg` or `GGGG` are now recognized — including `gggg-[W]ww`, the default weekly format in Periodic Notes and Calendar. The plugin wrote such names correctly but could never read the date back out of them, so a weekly note you made yourself was never attached to its journal, **Bulk add** skipped every one of your existing weekly notes as having no date, **Maintenance** could not recover a date from the note's path, and the journal's settings warned that the date was too coarse to tell the weeks apart. This held whether the week-year was in the note name or in a folder. Notes the plugin created itself stayed connected, since their date is kept in their properties — but where one's stored date went missing or was damaged, **Maintenance** could not fall back on the path to repair it.
- A weekly journal that files its notes under a year folder and names them by week number — a `{{date:YYYY}}` folder with a `{{date:[W]ww}}` name — now reads every week back out of the path. Under ISO weeks this failed for every week of any year whose 1 January falls on a Friday, Saturday or Sunday, such as 2021, 2022 and 2027: a note you made yourself in that layout was never attached, and **Maintenance** could not fall back on the path to repair a connected note whose stored date went missing or was damaged. Separately, week 53 was never read back from any layout that keeps the year in the folder and the week in the name while the current year has only 52 weeks.
- A journal that splits its date across folders and the note name, where the part carrying the day of the month also names the weekday, now reads the date back out of the path — including `YYYY/MM-MMM/DD-ddd`, a layout people use with Periodic Notes. A weekday beside the day of the month made the plugin read each part on its own, and no part alone names a day, so the date was never recovered: a daily note you made yourself in that layout was never attached to its journal, **Maintenance** could not fall back on the path to repair a connected note whose stored date went missing or was damaged, and the journal's settings warned that the date was too coarse to tell the days apart. A path whose weekday does not match its date is still not read as that date, and a weekday beside a week number or a day of the year, or with no day at all, still does not read back.
- A journal's settings now warn when its **Folder** uses something the plugin cannot read back out of a note's path — a variable it does not know, a function, or a time of day. The **Note name template** already had this warning, but the folder was never checked: a folder carrying one of these showed no warning at all when the note name held no date, or one saying the date was too coarse to tell the periods apart, which pointed at the wrong field. Either way, notes you made yourself in that folder were never attached to the journal. The warning now names the folder and appears under it. The note name the folder may use is not flagged.
- A view's **Blocks** list no longer shows a message name where a block's summary belongs. The line beside each block was read straight from your stored settings, without being interpreted the way the block itself reads them — so a value an earlier version wrote had no meaning to it. The **Calendar** view every vault is given stores its **Custom intervals** window in one of those older spellings, which is why that block read `view_block_config_window_selected` instead of **Selected month** on every vault; a **Notelets** block saved before it had a window option read the same way. Both now name their window, whichever version wrote it, and a block whose stored settings cannot be read at all shows no summary rather than a message name. What a block draws is unchanged — this was only the line describing it in settings.
- Changing your **Week configuration** now moves a notelet whose type you deleted while keeping its notes, along with every other note in that week. Moving the day a week starts on rewrites the date stored on every weekly note and on every notelet sitting in one of those weeks, so each still names its week's start — but a notelet left over from a deleted type was skipped, since nothing was left to rebuild its properties from. Its date is all that ever had to change, and it is now rewritten on its own, leaving the deleted type's name and every other property alone. Until now such a notelet kept the old week's date and then dropped out of the calendar, out of the notelets list and out of any notelet block the next time Journals read the note — when you edited it, at startup, or when your settings reloaded — over a file that looked untouched, and it was deliberately left out of the count reported after the change, so nothing said it had happened. It is now counted like any other note when its date cannot be rewritten. **Maintenance**'s repair for a note whose date is no longer its period's first day failed on one of these for the same reason; it now rewrites it, to the week that holds the note's old date.
- A journal that uses the date twice in its note paths, changing it in one of those places, now reads the date back out of the path. A daily journal filing notes under `Calendar/{{date<startOf=decade>:YYYY}}s/{{date:YYYY}}/{{date:MM}}`, or a weekly one with a `{{date:YYYY}}` folder and a name giving the week's start, was refused: as soon as any part of the path shifted or rounded the date, every part was read on its own and all of them had to agree, and a part alone names no date — a year folder reads as its 1 January, a month folder as the first of that month in the current year. So a note you made yourself in one of these layouts was never attached to its journal, **Bulk add** reading the date from **Note path** skipped every one of your notes as not being on the journal's path, **Maintenance** could not fall back on the path to repair a connected note whose stored date went missing or was damaged, and the journal's settings warned that the date was too coarse to tell the periods apart — for layouts that name every day uniquely. The parts are now put together into one date, which is accepted only once it renders the whole path back, so a folder naming a period the note name is not in is still refused, and so is a name holding a day no period of the journal starts on.
- A note name that moves the date and then takes the end of a period — `{{date+30d<endOf=month>}}` and the like — is now read back as the date it was written from. Reading a name backwards undid the move before the period, landing on a date that names a different note, so the name never inverted: a note you made yourself with one was not attached to its journal, and **Maintenance** could not fall back on the path to repair a connected note whose stored date went missing or was damaged. Where a whole period of dates renders the same name, the first day of that period is the one read back, as it is everywhere else. Names that only move the date, or only take a period's start or end, were never affected.
- A journal whose note names cannot be read back now says so for the right reason. A localized date format such as `LL`, or a timestamp, is written correctly and matches nothing on the way back — and the settings page called that a date variable not precise enough to tell the journal's periods apart, which is not true of a name that changes every day. The warning now tells the two cases apart by whether any date at all can be read back out of the path: one that gives a date back, just not the period you are looking at, is the coarse case and keeps its old wording, while one that gives nothing back names the format as the cause and says what to use instead.
- A note name that snaps the date twice — `{{date<startOf=week><startOf=month>}}` and the like — is now read back as the date it was written from. Undoing the second snap gave back a single date rather than the range of dates that render it, and the first snap was then answered from that one date: for a name built from the month a week starts in, the answer came back as the 1st of the month, which is a day no week need start on, and rendering it gave a different name. Notes in these layouts were written correctly and never matched, so a note you made yourself was not attached to its journal and **Maintenance** could not fall back on the path to repair a connected note whose stored date went missing or was damaged. Twelve of the hundred two-snap combinations were affected; the rest, and every name snapping once, read back as before.
- **Bulk add** now reads a date that carries a time of day with the format the value is written in. A property such as `creationDate: 2026-06-01T09:31`, which journaling apps and their importers write on every entry, used to skip every note as having no date when the date format was `YYYY-MM-DDTHH:mm` — only the date part alone, `YYYY-MM-DD`, found it. Both formats now connect the note, and so does any format holding hours, minutes, seconds, fractions of a second or AM/PM, including `LT`, `LTS`, `LLL` and `LLLL`. The time is ignored: the note connects to the day it names. Note names written with a time of day are read back the same way, so a note you make yourself with one is auto-attached. A format carrying a time zone, `Z` or `ZZ`, still cannot be read back.
- A journal whose start date falls partway through a period now numbers that first period. The period holding the start date always belonged to the journal, but sequential numbering compared its first day with the start date itself, found it earlier, and left it out — so a weekly journal starting on Monday 7 September, with weeks that start on Sunday, created its first note as `Week  - Sep 6 to Sep 12` with no index, while the week after it was numbered 2. A start date ends up inside a period when you change **Week configuration** after picking it, which moves your weekly notes to the new weeks but leaves the start date where it was, or when it was carried over from an earlier version of the plugin. The same applies to an **Anchor date** set partway through a period. Periods before the one holding the start date are still left unnumbered unless **Allow before anchor** is on. Separately, a custom-interval journal whose start date falls partway through an interval read a note named only by its number, such as `Sprint {{index}}`, back as a date the same few days past its interval's first day — so a note you made yourself with that name was never attached. It now reads back as the interval it names.
- A journal whose note name repeats over a longer stretch than a single period — a monthly journal named `{{date:MMMM}}`, so every March is called `March`, or a daily one named `{{date:MM-DD}}` — no longer silently takes over its own earlier note. Opening March 2026 found `March.md`, which was already March 2025's note, and rewrote its date to 2026: the note and everything in it moved to the new year, and March 2025 read as having no note, with nothing on screen to say so. The plugin now refuses and shows a notice naming the path and the period that note already belongs to, and leaves the file untouched; give the name template or folder something that changes every time, such as the year. Notes already moved this way before the fix cannot be told apart from ordinary notes, since the earlier date is not kept anywhere, so they stay where they are. A note of the journal's own whose stored date is not the first day of any period is still taken over as before, since that date names no other period it could belong to.
- A journal's settings now warn when its note name repeats a year later, such as a monthly journal named `{{date:MMMM}}` or a daily one named `{{date:MM-DD}}`. The warning under **Note name template** checked only whether a period and the one after it get different names, so a name that changes every month but comes back every March passed without a word — while opening next March would find this March's note. It now also checks the same period a year on, and says the date is not precise enough to tell the periods apart. A name whose folder carries the year, such as `{{date:MM-DD}}` inside `{{date:YYYY}}`, is not flagged. The step of **Import…** that connects the notes you already have reads the same check, so for a journal named this way it now says the notes cannot be connected, and why, rather than connecting every March to this year's.
- A custom interval journal counted in days or weeks now keeps its intervals before the **Start date** in step when you shorten one of them. The next interval started the day after the new end and, stepping forward, every later one kept its full length — so the schedule never landed back on the start date — while looking a date up and stepping back still counted intervals back from the start date. The two disagreed: the **next** arrow on the note after a shortened interval opened a date that was not an interval start, so a note created there dropped off the calendar, and a note on an interval the start date's schedule does hold could be disconnected when Journals re-read the vault. Before the start date, the interval after the one you shortened now runs up to the next regular start, the way months, quarters and years already did. Intervals from the start date on still shift after a shortening. A note already created at one of the shifted dates is reported by **Maintenance** as one whose date is not its period's first day.
- A view opened while a journal note is already open now moves to that note's date, as **Follow active note** promises. Opening the view from its ribbon button or its command showed today instead, and only switching to another note and back moved it. The view did move to the note as it appeared, but Obsidian hands a view its state a moment after showing it, and a newly opened view's state carries no date, which the view read as a reset to today. A view that was already open when you opened the note was never affected.
- Two journals that would both claim a note are now caught, and the notes they left behind can be connected. When a note you make yourself fits more than one journal's folder and name, it is deliberately connected to neither, since guessing would claim it for a journal you did not mean — but nothing said so, and **Colliding journal settings** often did not see the clash either. It compared the folder, name template and **Default date format** as written, so two day journals named `{{date:YYYY-MM-DD}}` in one folder went unwarned whenever their default date formats differed, although a name carrying its own format never uses the default and every note in that folder was left unconnected. A day journal named `{{date:YYYY-MM-DD}}` beside a week journal named `{{start_date:YYYY-MM-DD}}` was missed too, and silently lost every Monday's note. The warning now compares the paths the journals actually write, within each journal's timeline, so it catches both and no longer flags journals whose timelines never overlap. **Maintenance** now also lists every note that no journal claims but more than one would adopt, under the names of those journals, with **Connect to** and a journal's name for each one that can still take it; a journal that already has a note for that period offers no button and the row says why. The check runs only while the journals still clash — once you change one of them, the note matches a single journal and is no longer listed, so connect the notes first, or use **Bulk add** afterwards.
- A variable rendered into a template's frontmatter properties no longer breaks the note it creates. A value containing `: ` — a colon followed by a space, such as a sentence with "Today: rough" in it — stopped the note from being created as a journal note at all: it was still written to disk, but without the journal's properties and not attached to the journal, and opening the same date again hit the same failure. A value containing ` #` was written silently cut short at the `#`, since YAML read what followed it as a comment. Both now read back exactly as typed, and so does a value spanning several lines — such as a **Long text** answer — which is written over several lines of its own when it is the whole of a property's value or of a list item, and as a single quoted string otherwise, rather than folded onto one. A value that already worked, such as a number, a `true`/`false` value or a list, keeps its type as before.
- A journal or notelet type whose questions include one this version cannot read now keeps its other questions. Settings that failed on a single question — one added by a newer version of Journals, or damaged by hand — used to lose every question of that journal or type the next time Obsidian started, and the loss was saved over your settings with your next change. Now only the unreadable question is dropped, and the warning in the log names it.
- Two journal notes created back-to-back for the same period — through the plugin API, `obsidian://journals` links, or two requests over the Local REST API answering the same journal's questions differently — no longer risk becoming two notes. A second create used to find nothing in the index until Obsidian's metadata cache had caught up with the first, and a call landing in that gap wrote a second note, silently under a different name on a journal whose note name uses an answer. Journals now registers a note in its index the moment it writes it, so a call arriving in what used to be that gap finds the first note there and reuses it instead of creating another. One observable change for a plugin API consumer: `noteAdded` and `noteletAdded` now fire as soon as Journals writes a note, which can be before Obsidian's own metadata cache has parsed it.
- An answer typed into **New note in** for a question the note name or folder uses can no longer contain a character a file name can't hold. Such an answer used to be written into the path as typed: a `:` made the note fail to create, a `/` quietly put the note in a new subfolder named after part of your answer, `?` and `|` made a note Windows cannot save — so it never synced to a Windows device — and `#`, `^`, `[`, `]` and `|` broke every link to it. The dialog now refuses `* " \ / < > : | ? # ^ [ ]` and line breaks in these answers, on every device, since the vault may sync to one that can't take them, and keeps what you typed so you can change it. Answers passed to the plugin API — and so over the Local REST API and its MCP tools — are refused the same way, as `invalid-answers`. Answers that go only into the note's body or properties are not affected.
- A device still running an older Journals no longer saves its settings back over newer ones that reached it through sync. When settings saved by a newer version arrive — from Obsidian Sync, Syncthing, iCloud or git — the older copy could not read them, kept the settings it already had, and wrote those back over the file the moment anything was changed, or a change made just beforehand was saved. Everything only the newer version can express was collapsed on the way back, on every device, with nothing said about it. Such a copy now stops saving settings entirely: the settings page says so, restoring a snapshot and importing from other plugins are unavailable, and a notice explains that changes made until then are discarded. Restarting Obsidian, which loads the newer Journals that has usually already arrived, clears it; so does updating Journals on that device. The protection only exists in this version and later ones, so a device still running an earlier release behaves as before.
- Where a device running an older Journals has already overwritten your settings, a copy of the settings it replaced is now kept. The newer device notices the older shape arriving, saves what it was holding as a settings snapshot named "Taken when an older version replaced these settings", and shows a notice — **Restore** under **Maintenance** puts them back. Until now nothing was saved at that moment: the backup taken before a version upgrade had already been written for that version, and the same file was never written twice, so the one copy worth keeping was the one that was skipped. Only settings that actually changed on disk count, so an ordinary upgrade, where the stored settings stay at the older version until something is next saved, is not mistaken for this.

## [3.4.0] - 2026-09-12

### Features

- Two new commands move between journals of different period lengths from the note you have open: **Zoom out** and **Zoom in**. From a daily note, zooming out opens that week's note; from there, the month's, and zooming in walks back down. Zooming stays among the journals on the shelf the open note's journal belongs to — so a work daily note zooms to the work monthly note rather than a personal one — and reaches every journal when that journal is on no shelf. A period length nothing in scope writes at is passed over, so a vault with only daily and monthly journals zooms straight between them, and a custom-interval journal takes its place by how long its interval runs: a two-week sprint sits between the weekly and the monthly journal. A journal whose timeline does not reach the date you are on is passed over the same way. Zooming in opens the first shorter period inside the current one — the 1st of the month, from a monthly note. The note is created if it does not exist yet, and where two journals in scope write the same length of period, you are asked which of them to open. Both commands stay out of the command palette on a note that belongs to no journal, and when nothing in scope is longer or shorter.
- **Open on startup** can now open a different journal depending on the day of the week. Pick the journal that opens by default, then add a group of days and the journal those days should open instead — Saturday and Sunday to a personal journal, say, while the rest of the week opens a work one. Days you do not claim open the default journal, and a group can be set to open nothing at all, so a work journal can stay shut at the weekend. Each day belongs to one group: days another group already claims are shown greyed out. A journal picked before this arrives keeps opening every day until you add a group, and a journal you delete is dropped from the groups naming it, leaving those days on the default.
- A journal's navigation block can now show only the current period, with its previous and next arrows and nothing else. Turn off **Show previous and next periods** on the journal's navigation block and the two period names beside the current one go away; the arrows stay, and still open those notes. The current period and its arrows then sit together in the middle of the note rather than spreading across its width. A single note can override the journal either way with an `adjacent` option on the block — `adjacent: false` for just the current period, `adjacent: true` where the journal hides them.
- A `calendar-timeline` block with previous/next controls now spends one row instead of two where it shows a single grid — `week` or `month` mode with no `before` or `after`. The arrows and the reset control move onto either side of the grid's own month, quarter and year headings, and the separate row naming the period on screen goes away, since those headings already name it. The headings keep working as links, so the row beside the arrows is now the fastest way to that week's month or year note. Blocks showing several grids — a padded window, `quarter` mode, `calendar` mode — have no single heading to join and keep both rows.
- A new **Automatic note creation** setting chooses which devices create notes on their own: desktop and mobile, desktop only, or mobile only. It covers both the startup note and every journal's **Auto-create today's note**, and notes you open yourself are always created wherever you are. On a device the rule excludes, the startup note still opens if it is already there, and nothing at all is written to it — not even the properties the plugin normally refreshes on open. Use it where a sync service is slow enough that your phone and your computer each create today's note before the other's copy lands, leaving two files for one day; it settles that by leaving one device in charge, so it does not help with two computers racing each other. A journal's edit page says which device its auto-create toggle applies to whenever the rule is narrowed.
- A calendar cell now draws at most a few decoration marks in each of its nine positions, rather than every mark that matched. **Marks shown per position** on the main settings page sets the cap — 3 by default, or Unlimited — and anything over it collapses into a `+N` badge; hover the badge to see the marks it hides, drawn larger. Where more marks match than fit, the journal's own win over its shelf's, and a shelf's over vault-wide ones, the same way the rest of the decoration cascade resolves. The cap applies to every decoration whatever its owner, and to calendars, navigation blocks, interval rows and period buttons alike. It changes only what is drawn — **Explain decorations** still lists everything that matched.
- The plugin API gained range reads, so a consumer drawing a grid of periods no longer makes one call per cell. `notesInRange(selector, { from, to })` returns one entry per period the window overlaps, whether or not a note is there — a year of daily periods in one call instead of 365 — and `existingNotes(selector, range)` returns only the notes that exist, with `path` and `file` always set. Called without a range, `existingNotes` returns every note the matched journals have written, which a consumer previously had to answer by walking every markdown file in the vault. `noteletsInRange` does the same for notelets. Both ends of a range are inclusive, an inverted range returns nothing, and the window is matched by overlap on the journal's own periods — so a monthly journal read from the 15th of January still reports January, and each period appears once however long it runs, where iterating days and calling `notesFor` per day returned the same week seven times. `apiVersion` stays 1, since every addition is additive; as before, a test double written as `implements JournalsApi` will stop compiling until it gains the new methods.

### Bug Fixes

- Stepping backwards through a custom-interval journal no longer skips the interval a shortening created. Pulling an interval's end in hands the days up to the next interval to a new interval starting the day after — but the previous arrow on a navigation block, and everything else that walks backwards, stepped over it and landed on the shortened interval instead, so going back one period went back two. Walking back now lands on the same intervals walking forward passes through. Where the shortened interval sits before the journal's own anchor date, a date inside the new interval also opened the shortened interval's note; that now opens the right one.
- A custom-interval journal no longer shows an interval you shortened in a window that opens after that interval already ended. Pulling an interval's end in leaves the days between its new end and the next interval's start belonging to the next interval, but a range read still reported the shortened one for a date in that stretch — so an interval row, a notelet listing or a calendar could name an interval that closed days earlier. A range now reports only the intervals still running when it opens.
- Journal variables now resolve in a sub-template Templater includes. A template calling `<% tp.file.include("[[Sub-Template]]") %>` had its own `{{date}}` and other variables filled in, but the included file's reached the note written out as `{{date}}` — Templater reads an included file straight off disk, past the point where the variables are filled in. An included file's variables are now filled in before Templater runs its commands, so it can use them inside a Templater command as well as in its text.
- A journal's navigation block could already skip over the periods you have no note for — jumping straight from one existing note to the next, however far apart they are — but the setting that turns this on was called **Mode**, with the choices **Create new note** and **Open existing note**, which read as descriptions of what clicking the block does rather than of what the arrows step over. The setting is now **Previous and next arrows**, its choices are **Step to the adjacent period** and **Jump to the nearest existing note**, and it explains both. Clicking a segment creates that segment's note whichever you pick; the manual previously described this setting as controlling segment clicks, which it never did.
- A calendar decoration or a bulk-add filter that compares a **Date & time** property now answers by date. Obsidian keeps a time on such a property, and it was being compared against the date you picked as plain text, so **is** never matched a note, **is not** matched every note, **is on or before** left out the day you picked, and **is after** included it — only a property typed **Date**, with no time on it, behaved. The time part is now left out of the comparison, so all six comparisons answer for the day. A value that is not a date at all no longer answers any of them: a date comparison can be pointed at any property, and text was previously ordered against the date as text, so a note whose property read `someday` counted as **is after** every date you could pick.
- Changing your **Week configuration** now counts a notelet it could not update among the notes it reports. Moving the day a week starts on rewrites the date stored on every weekly note and on every notelet sitting in one of those weeks, so each still names its week's start; one that cannot be rewritten drops out of the calendar over a file that looks untouched, which is what the count shown after the change is there to warn you about — but a notelet that failed reached that count no more than it reached anywhere else. A notelet whose type you deleted while keeping its notes stays out of the count: with its type gone it can never be re-anchored, so counting it would report the same notes after every change you ever make.
- A navigation block in a popout window now stacks its columns when the pane is too narrow for them. The measurement that decides whether the columns still fit counted nothing at all in a popout — a popout builds its elements from its own window, which the check did not recognize as elements — so the block stayed unstacked however narrow the window got, and flex wrapping dropped whichever single column did not fit, leaving two beside each other and one below. Blocks in the main window measured correctly and are unchanged.
- The day-of-week pickers now reorder as soon as you change your **Week configuration**. A decoration's **Weekdays** condition and a calendar block's **Days of the week** row listed the days starting from whichever day the week began on when the control was first drawn, so moving the week's start left them in the old order until the surface was reopened.

## [3.3.0] - 2026-09-06

### Features

- A journal can now ask questions when it creates a note, and put your answers into the note's properties, its template content, and its name. Configure them under **Questions** on the journal: each question has a type — text, number, date, yes/no, or a choice from a list you define — and can be saved to a property of your choosing. Use an answer anywhere you use a journal variable, as `{{your_variable}}`; a date answer takes formats and shifts like `{{date}}` does, using the format you set on the question. A question whose answer appears in the note's name or folder must be saved to a property and cannot be left blank, since a name has to be settled before the note exists. Clicking a link to a note that does not exist yet asks the questions first, then names the note from your answers — cancelling leaves you where you started. Automatic paths never ask: auto-create refuses rather than guess, notes arriving by sync already carry their answers, and adding an existing note to a journal by **Connect note to a journal** or **Bulk add** keeps that note's own name rather than renaming it to a name nobody has answered for. A choice question saved to a property is also what lets a calendar decoration colour a day by the answer you gave it.
- A journal can now keep more than one note for a period. Define **notelet types** on a journal — meeting notes on a day, a retro on a sprint, a reading log on a week — and each type gets its own folder, note name template, template notes, questions, numbering and creation confirmation, plus a command that creates one. A **notelet** sits alongside the period's own note rather than replacing it, and a period can hold any number of them. Create one from the type's command, from the **New notelet** button on any notelet list, or from a link like `obsidian://journals?journal=Daily&notelet=Meeting&date=today`. A new `{{notelet_index}}` variable numbers each notelet within its period, restarting every period; where a type's name template has nothing that varies within a period, the settings page says so and the plugin adds a number to the file name so nothing is overwritten. List them with the new **Notelets** view block or a ` ```journal-notelets ` code block, which reads the period of whatever note holds it — a period note or a notelet alike — and can be narrowed to particular types. A new **Has notelet** decoration condition paints the days that have one, for any type or for the types you pick. Notes you already have can be adopted: **Connect note to a journal** now offers the journal's notelet types beside its period note, and a type's **Bulk add** connects a folder of notes in one pass, numbering them in scan order. Renaming a type rewrites the notes carrying its name, leaving them where they are; deleting one asks whether to keep those notes, clear the plugin's properties from them, or delete them, and takes the type out of any decoration that matched on it; cloning a journal offers to copy its types. The vault check reports notelets naming a type their journal no longer has.
- The plugin API gained a notelet surface: `noteletOf` resolves the notelet a file holds, `noteletsFor` lists a period's notelets across the journals a selector matches, `createNotelet` creates one (leaving it unopened unless you pass an open mode), `openNotelet` opens one, each listed journal now carries its notelet type names, and `noteletAdded` / `noteletRemoved` events fire as they come and go. `ensureNote` and `openNote` gained a `prompt` option to go with it: a journal's creation questions are asked by default, and passing `prompt: false` makes a journal that cannot proceed without an answer fail with the new `prompts-required` error code instead of holding a modal open — useful where the call must not block. Asking for a type a journal does not have fails with `notelet-type-not-found`. `apiVersion` stays 1 — every addition is additive. Note for plugin authors: a test double written as `implements JournalsApi` will stop compiling until it gains the new methods, as [`docs/plugin-api.md`](docs/plugin-api.md) warns.
- A new **Notes by date** view block lists every vault note created in the period containing the view's selected date. Choose the period from day through decade, sort by name, creation date, or last modification, and configure which Frontmatter property records creation dates. The block can optionally show previous and next controls that follow its chosen period. Calendar blocks now let you select their date by Shift-clicking a day, or pressing Shift+Enter or Shift+Space on a focused one, without opening or creating a journal note; their calendar grids support arrow-key navigation, and view toolbar buttons can step the selected date one day at a time.

### Bug Fixes

- Renaming a journal note now updates the links pointing at it. Renaming through **Connect note to a journal** or **Bulk add** moved the file and left every link to its old name dangling. Obsidian asks once per vault whether to update links when it first happens; answering **Always update** settles it for good.
- A calendar view left open across midnight now moves on to the new day. It kept marking yesterday as today until Obsidian was restarted.
- The **Open shelf** command now says so when there is no view open to show the shelf in, instead of doing nothing.
- Journals created in the same session no longer share one navigation block, interval block, and set of decorations. Editing the navigation block of one daily journal used to change every daily journal created alongside it in that session, and a journal created after such an edit was born carrying it; restarting Obsidian separated them again, so journals created in different sessions were never affected. A journal already changed this way keeps the settings it ended up with — check the navigation blocks and decorations of journals you created together, and set them back by hand where they are wrong.
- A fresh install no longer logs a repair warning at startup for settings it has never saved. Having no stored value yet was being treated the same as a corrupted one, so a brand-new install's log read as if its settings were already damaged.
- Auto-create no longer stops for the rest of the session when a journal template waits for input. A template that opens a prompt — Templater's `tp.system.prompt` or `tp.system.suggester`, for instance — never finishes on its own at midnight, when nobody is there to answer it, and that silently took auto-create down until Obsidian was restarted; journals listed after the waiting one never got their notes at all. The midnight check is now scheduled before the notes are written rather than after, and each journal gets a bounded wait before the rest are attended to. A prompt you answer later still writes its note.
- `{{journal_link}}` and the **Insert journal link** command now link to the note the journal actually has, instead of to the path its folder and name template would produce. A journal note that lives somewhere else — connected in place keeping its own name, or renamed or moved after it was connected — used to get an unresolved link pointing at a file that was never there. `{{journal_link}}` also no longer refuses a note whose period has fallen outside the journal's timeline: a journal only writes within its timeline, but a note it has already written stays linkable. A period with no note yet still links to where its note will be created, so linking ahead to a note you have not written continues to work.
- Decorations set on one custom journal no longer show up on another custom journal's rows in the calendar view's list of intervals. Two custom journals whose intervals start on the same date shared one set of decorations there, so a journal you had left undecorated drew whatever the other one drew. Each journal's rows now draw on that journal's own decorations only.
- Opening a date in one journal no longer takes over a note that belongs to a different journal. Two journals whose folder and note name settings happen to produce the same file — one naming notes `{{date:YYYY-MM-DD}}` and another naming them `{{date}}` with a matching date format, say — used to hand that file to whichever journal you opened last: the note's **journal** property was rewritten and the note dropped out of the journal that had actually written it, with nothing on screen to say so. The second journal now leaves the note alone and tells you which journal owns it. Give one of the two a different folder or name template if you want both to have a note for that date.

## [3.2.0] - 2026-08-23

### Features

- A `calendar-timeline` code block can now carry previous/next controls, so you can look at other periods from the note you are reading without opening or creating anything. Add `navigation: true` to a block, or turn on **Timeline navigation** in the calendar settings to give every block the controls at once — a block's own option wins over the setting either way. The controls step by the block's own period (a week in `week` mode, a month in `month` mode, and so on) and name the periods on screen; a reset control appears once you have paged away and returns the block to the period of the note holding it, as does anything that makes Obsidian re-render the block.
- Other plugins can now integrate with Journals through a documented API. Install [`obsidian-journals-api`](https://www.npmjs.com/package/obsidian-journals-api) for the typed surface and a `getJournalsApi(app)` locator that returns nothing when Journals is not installed or not enabled. It covers listing journals, finding the note for a date, creating and opening one, and subscribing to journal and note changes. Because a vault can hold several journals of the same kind, reads return every match and writes ask which one to use — the same picker you see clicking a calendar cell. See [`docs/plugin-api.md`](docs/plugin-api.md).
- A decoration can now match on a journal note's size: word or character count against a threshold, using `>`, `>=`, `<`, or `<=`. The count uses the same definition as Obsidian's own word count — frontmatter is not counted, everything else is, including code blocks and comments — so it matches the number Obsidian shows in its status bar.
- A new `{{week_of_month}}` template variable numbers a note's week within its month, counting the week that holds the 1st as week 1 and following the start of the week from the calendar settings, so it agrees with the week numbers the calendar shows. Because a week can straddle two months, the month it counts within is the month of the date it is read from: `{{week_of_month}}` counts within the note's own month, while `{{week_of_month<endOf=week>}}` counts within the month the week ends in, moving a whole straddling week into the later month — pair it with `{{date<endOf=week>:MMMM}}` so the month and the number agree. It takes the same offsets and ordinal format as a numbering variable (`{{week_of_month-1}}`, `{{week_of_month:o}}`), and a note name built from it is still recognized as the journal's own.
- Decorations can now carry more than one condition of the same type. Property, tag, title, date, offset, and note-size conditions can repeat; weekday, has note, has open tasks, and all tasks completed still cannot, since a second instance of those says nothing the first does not. This is what lets a single decoration express a band, like note size >= 250 and < 1000.

### Bug Fixes

- A note whose name carries a date too coarse to tell the journal's periods apart — a year in front of sequential numbers, say — is now matched to its period by the whole name rather than by the date alone. Previously every note of the year attached to whichever period contained January 1st: a journal named `{{date:YYYY}}-C{{cycle}}-S{{sprint}}` collapsed its whole year onto one interval, and a monthly journal named `{{date:YYYY}}-M{{month}}` put all twelve months on January. Notes arriving from sync, added in bulk, or repaired by the vault check all landed on the wrong period. The date and the numbers now identify the period together, so numbering that repeats — twelve months, four quarters — is enough as long as the date says which year it repeats in.
- The months of a `calendar-timeline` block in `quarter` or `calendar` mode now line up with each other. Each month used to reserve room for decorations from its own cells alone, so a month holding decorated notes got visibly wider cells than the months beside it and squeezed them out of shape; every month in a block now reserves the same room. Where the months no longer fit side by side, the block wraps them onto another row instead of cutting the last one off at the edge of the note.
- The calendar now moves its highlight of today when the date changes, instead of holding it on the day Obsidian opened. A calendar left open across midnight kept marking the previous day until a restart, and the same stale date reached the home block's links, the relative dates in navigation blocks ("Today", "Yesterday"), `{{current_date}}` in a markdown block, and the period a `calendar-timeline` block falls back to in a note outside every journal. They all turn over at midnight now, and re-check the date whenever you come back to Obsidian, so a machine that slept through midnight catches up as soon as its window is focused again.
- A `calendar-nav` block on a narrow pane — a note on a phone, a split editor pane — now keeps the previous, current and next periods on one line wherever the three of them fit, instead of leaving two side by side with the third dropped underneath. Both arrows now sit beside the current period rather than beside the neighboring one each points at, so a line that does break never separates the period from the controls that move it, and the previous and next periods render a little smaller than the current one, which is what makes room for all three. Where three genuinely cannot share a line — a monthly block on a phone, whose month names are wider than the pane — each period takes a line of its own rather than two sharing one. A long name no longer overruns its column either, so months like "November" and "December" stop printing over each other and over the arrows.
- The name template warning in settings no longer falls silent just because the name contains a date variable. A template whose numbering cannot be turned back into a date is now flagged even when a date variable is present, and a name whose date variable cannot tell the journal's periods apart — with no sequential numbers to complete it — is now called out in its own right.

## [3.1.0] - 2026-08-17

### Features

- Navigation block rows can now hold several segments side by side, each with its own template text, style, link and decorations — split a row into segments, or join segments back into one row, by dragging them in the settings preview.
- A navigation segment's link can open a shifted date instead of the date it would open by default: the **Link date** field takes the same shift syntax as template date variables, so a row can open next quarter's note, yesterday's note, or the month a row names.
- Clone a journal from settings: the copy carries the source's whole configuration, joins the same shelf, and gets its own copy of the source's commands. Notes are not copied.
- A numbering variable can now be offset and rendered as an ordinal: `{{index+3}}` adds three to the rendered value, `{{index-1}}` subtracts one, and `{{index:o}}` renders it as an ordinal ("4th"). They combine as `{{index+3:o}}`, and both survive the round-trip out of a note name, so a journal named `Sprint {{index+3}}` still recognizes its own notes. This offset syntax now applies to any variable name, not only numbering ones, so a template that happened to contain a literal `+3` or `-1` after a variable name (for example `{{date+3}}`) will render differently from before.
- A new Maintenance page in settings gives you a way back if an update to the plugin damages your settings: before your settings are migrated to a new version, a snapshot is saved automatically, and you can restore it from the Maintenance page with one click.
- The Maintenance page can also run a vault check: it finds notes whose frontmatter no longer matches their journal — notes the calendar can no longer see, notes whose period range is wrong, and notes more than one file claims the same period for — and repairs the safe cases individually or all at once. Notes it cannot safely repair are listed with an explanation instead of a guess.
- A `calendar-timeline` code block in `week` or `month` mode can now show neighboring periods around the current one, using the new `before` and `after` options: `before: 1` with `after: 1` in week mode renders the previous, current and next week together.
- Sequential numbering can now chain several digits together, each with its own variable name, start number, and reset rule, so the fastest one carries into the next when it wraps — a name template of `Release{{release}}Sprint{{sprint}}` with `release` never resetting and `sprint` resetting every 6 notes produces `Release4711Sprint1` … `Release4711Sprint6`, then `Release4712Sprint1`.
- A numbering digit's variable name can be written in any script — `{{спринт}}` or `{{スプリント}}` is accepted where only Latin letters were before.

### Bug Fixes

- A navigation segment whose template shifts the displayed date (for example `{{date+1q:[Q]Q}}`, labelled one quarter ahead) now opens that shifted date on click, from the context menu, and in link previews; previously it opened the note's own date while showing the next one's label.
- A decorated navigation segment now shows the decorations of the note its link opens, rather than the host note's — a row linking to the year journal now decorates from the year's own rules instead of the day's. If **Add decorations** is on for a row that links to something other than the current period, its appearance will change after upgrading.
- Renaming a journal now updates any navigation segment that links to it by name, and deleting a journal clears that link instead of leaving the segment pointing at a journal that no longer exists.
- The warning shown when a name template without a date variable cannot be turned back into a date now says which digit is at fault instead of a single generic message: it names the numbering variables the name and folder templates leave out, or the digit below the slowest one that never resets and so freezes every digit above it.
- Navigation block rows — including the custom-interval list in a view — now render `{{note_name}}` and `{{title}}`. A row shows the name of the note it opens, or the name that note would get for a period whose note does not exist yet.
- `{{current_date}}`, `{{time}}` and `{{current_time}}` now resolve in navigation block rows; the variable reference listed them, but they came out as literal text.
- A week configuration arriving from sync now re-anchors weekly notes on the receiving device, the same way changing it on that device does; previously the calendar moved but the notes did not, so their cells read as empty and the open-this-week command could start a second note for the week.
- Opening a journal note now opens it in the window you are working in; previously, if the note was already open in another window, Obsidian jumped you over to that window.
- Middle-clicking or Ctrl/Cmd-clicking to open a journal note in a new tab, split, or window now does so even when the note is already open somewhere; previously the request was ignored and the existing pane was focused instead.
- Picking a journal from the menu that appears when several journals cover the clicked date now opens or creates that journal's note on macOS; previously the pick was silently discarded, so a date that more than one journal could answer for — the usual case in a calendar scoped to all journals — could not be opened at all. The menu still uses whichever style macOS is set to show.
- A journal carrying one unreadable setting now keeps everything else it has — its period, folder, name template, templates and decorations — and only the unreadable setting falls back to its default. Previously the whole journal was replaced by a daily journal that kept nothing but its name, so an upgraded vault could end up with every journal writing days: clicking a date offered all of them at once, and the week, month, quarter and year cells stopped responding.
- A decoration that matches on a note property no longer costs its journal its configuration when upgrading from an earlier version. Such conditions predate property value types and are now read as text conditions.
- A journal that splits its date between the folder and the file name — a `{{date:YYYY}}` folder with a `{{date:[Q]Q}}` or `{{date:[W]ww}}` name, say — is now recognized from its own note paths. Previously only a quarter starting on 1 January in the current year was matched, and weeks essentially never were, so such notes were not adopted automatically and bulk add did not find them. Day-of-year names (`DDD`, `DDDD`) containing a zero are now matched too.
- A note that appears in the vault while Obsidian is running — arriving over sync, restored from trash, or written by another tool — is now left alone until Obsidian has read it. Previously it was adopted immediately, before its own frontmatter could be seen, and rewritten as if it were a new note. For a custom-interval journal that destroyed a manually adjusted end date, and since that date is where the next interval starts, every later interval shifted with it.
- Editing a note's end date or its numbering value by hand now takes effect straight away. Previously the plugin kept using the old value until Obsidian was restarted: extending or shrinking a custom interval left the calendar and navigation on the old boundary, which then jumped on the next launch, and a corrected number stayed stale for the rest of the session.

## [3.0.0] - 2026-08-14

### Features

- Complete rewrite of the plugin on a new modular foundation, with automatic migration of settings and existing notes from earlier versions.
- Build and customize your own calendar views by composing blocks (month, week, quarter, year, decade, and custom-interval calendars, plus toolbars, dividers, and spacers) and toolbar items (shelf selector, period buttons, navigation buttons, and more).
- Target a specific journal from a custom command or toolbar button, so hotkeys act on it without prompting.
- Choose where the week-number column appears per block, with a global default.
- Open a view as a main tab, not only in the left or right sidebar, and decide per view whether it opens at startup.
- Have a view reopen on the date you last visited instead of always starting on today.
- Middle-click or Ctrl/Cmd+Alt-click a navigation link to open the note in a new tab or a split, the way an ordinary Obsidian link behaves.
- Open the nearest existing note for a journal or shelf, via command or an existing notes navigation toolbar item.
- New markdown-template block for custom views that renders a template file inline.
- Look up what a code block or template variable produces without leaving settings: a reference modal lists each one with a live preview and click-to-copy snippets.
- Automatically attach externally created notes that match a journal's naming.
- Logging tools that capture activity and dump it to a note for troubleshooting.
- Open journal notes through the Obsidian URI scheme.
- Insert a link to a journal date at the cursor via command.
- New `journal_link` template variable.
- Hide specific weekdays on the calendar with a per-weekday picker.
- Highlight calendar days by date or weekday without attaching the rule to a journal: set decorations vault-wide, or per shelf so they apply only while that shelf is in view.
- See why a calendar cell looks the way it does: right-click it for a breakdown naming the rule behind each color, border, and mark, and the rules those overrode. The breakdown follows the shelf you are viewing, and a custom interval explains itself rather than the day it begins on.
- Tell a decoration that never fires from one whose day simply has not come up: every rule in settings reports whether it has matched recently, and an inspector shows everything decorating a chosen date across all three scopes.
- The interface now speaks ten languages besides English — Chinese, German, French, Russian, Spanish, Portuguese, Japanese, Korean, Italian, and Ukrainian — each reviewed key by key.
- Meaningful, stable CSS class names on calendar and code-block elements for easier theming.

### Bug Fixes

- Warn when a name template would connect every entry to the same note; previously, notes with only a title and no date all collided onto a single note.
- Renaming the property a journal writes its date or numbering into now moves that value in every connected note; previously the notes kept the old property name and silently dropped off the journal.
- Weekly navigation now reaches ISO week 53 at year boundaries instead of skipping it.
- Changing the week configuration now updates the calendar straight away; previously the old first day of the week stayed in place until Obsidian was restarted.
- Upgrading repairs weekly notes whose stored date was not the first day of their week; previously such a note dropped off the calendar and the open-this-week command reached the previous week's note.
- Sequence numbering resets now cycle correctly.
- A journal numbered from zero now renders its index in note names and writes it to frontmatter; previously the first entry lost its index entirely.
- A custom interval anchored mid-week now keeps that day as its anchor instead of snapping back to the start of the week.
- Creating a weekly journal mid-week now creates the current note immediately instead of waiting for the next week.
- Decorations based on a checkbox (boolean) property now match correctly.
- A navigation link no longer opens two context menus at once.
- Navigation blocks now wrap to fit a narrow pane instead of overflowing and clipping on mobile.
- Previously imported notes now appear on the calendar after startup.
- The open-next and open-previous note commands now work in Reading (preview) mode.
- Interval-offset decorations now mark the interval's first day by default instead of never matching, and the editor spells out which day the offset targets.
- Where two of a journal's decorations both set a background or a text color, the later one now wins; previously the earlier one did, which disagreed with how borders already resolved.
- At most one corner decoration now renders per corner of a cell; previously every matching corner stacked on top of the others.
- A newly added background, corner, shape, or icon style now arrives with a visible color instead of a transparent one that rendered as nothing.
- Corrected a misspelling in the description of the vault-wide week configuration setting.

## [2.1.9] - 2025-06-07

### Bug Fixes

- Fix relative week calculation

## [2.1.8] - 2025-06-07

### Bug Fixes

- Fix relative weeks calculation
- Fix displaying shelf selector in calendar view
- Fix calendar view updating month on week note selection

## [2.1.7] - 2025-05-02

### Bug Fixes

- Force normal text color in calendar to avoid issues with text-on-accent being inverted

## [2.1.6] - 2025-05-01

### Bug Fixes

- Fix active week highlight when weeks are displayed after weekdays

### Ux

- Improve ux of journal settings

## [2.1.5] - 2025-04-26

### Bug Fixes

- Update button dropdow position to solve issue with display on mobile
- Fix showing Update button in Week configuration modal
- Add hint about creating folder in name template
- Add fallback for empty name template
- Add hint about using W in variables

## [2.1.4] - 2025-04-12

### Bug Fixes

- Fix plugin and shelf commands edit and ribbon icons for them

## [2.1.3] - 2025-03-20

### Bug Fixes

- Fix UI updates on week settings change

## [2.1.2] - 2025-03-19

### Bug Fixes

- Fix bulk adding notes to journal

## [2.1.1] - 2025-03-16

### Bug Fixes

- Fix applying today background color
- Fix restoring default locale, improve week settings modal ux

### Ux

- Update path preview to make spaces at end more visible

## [2.1.0] - 2025-03-10

### Bug Fixes

- Fix calendar button styles in some themes

### Documentation

- Enhance README with comprehensive documentation

### FEAT

- Add commands on plugin and shelf level

### Features

- Support startOf and endOf modifiers for date variables
- Add size to icon and shape decoration styles, polish decorations display
- Add preview functionality
- Add option to apply week settings to vault
- Add notification about command ids, restore v1 global commands

## [2.0.2] - 2025-03-06

### Bug Fixes

- Fix adding start/end date to new notes when configured

### Ux

- Make shelf more obvious in journal settings

## [2.0.1.beta3] - 2025-03-02

### Bug Fixes

- Update build for plugin o work on ios

## [2.0.1.beta2] - 2025-03-02

### Bug Fixes

- Import moment from obsidian

## [2.0.0.beta4] - 2025-03-01

### Bug Fixes

- Fix v2 data migration
- Improve migration flow
- Fix migartion flow by ensuring step components gets recreated

### Refactor

- Rearrange migration functions, add tests

## [2.0.0.beta3] - 2025-02-28

### Bug Fixes

- Obsidian reload should not move calendar view
- Replace spaces in command id with dash

### Testing

- Add first portion of journal tests

### Ux

- Add warning about creating folder with date format and link to fix

## [2.0.0.beta2] - 2025-02-19

### Bug Fixes

- Fix next/prev month navigation in date picker
- Fix renaming journal was not updating notes
- Fix wrong text

### Documentation

- Add missing shelves description, fix code block example

### Ux

- Prefill frontmatter field name while editing

## [1.4.3] - 2024-10-23

### Bug Fixes

- Support time and title template variables

### Features

- Support templater cursor

## [1.4.2] - 2024-10-15

### Bug Fixes

- Fix bulk node processing

## [1.4.1] - 2024-10-14

### Bug Fixes

- Fix adding existing notes to journal

## [1.4.0] - 2024-07-07

### Bug Fixes

- Prevent failures on unexpected frontmatter data
- Fix indexing inconsistencies
- Improve calendar styles
- More calendar view improvements

### Features

- Add relative date calculations to date template variables

## [1.3.0] - 2024-03-31

### Bug Fixes

- Check id uniqness when creating a journal

### Features

- Focus calendar view around opened note
- Add setting to restrict note creation before start date
- Allow configuring how interval journal ends
- Better templater interop
- Add existing notes to journal in bulk

## [1.2.0] - 2024-03-03

### Bug Fixes

- Show journals in lexicographic order in journal selection menu
- Typo

### Features

- Open note on pick date and today buttons click
- Controll visibility of weeks in calendar view by settings
- Highlight current intervals similar to today
- Use context menu for journal selection in calendar view
- Add context menu to calendar view
- Add setting to show intervals in reverse order in calendar view
- Command to connect node to a journal

## [1.1.0] - 2024-02-25

### Bug Fixes

- Clarify section folder setting to be relative to root folder
- Fix type error

### Features

- Add next/prev note command
- Make rendering of interval-nav code block configurable
- Add calendar view

## [1.0.1] - 2024-02-17

### Bug Fixes

- Delay frontmatter processing

<!-- generated by git-cliff -->
