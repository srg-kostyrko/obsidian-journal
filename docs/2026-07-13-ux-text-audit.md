# UX & Text Audit — 2026-07-13 (v3-ai)

Deep audit of user-facing text (`messages/en.json`) and UX across settings, modals,
and runtime surfaces. Items marked **[normalized]** were fixed in the en.json
normalization pass done alongside this audit; items marked **[fixed]** were resolved
in the follow-up implementation pass the same day. Only unmarked items remain open.

## A. Copy style rules (adopted in the normalization pass)

The corpus read like several authors. These rules were applied and should govern
new strings:

- Sentence case everywhere (Obsidian plugin guideline). No Title Case option labels.
- en-US spelling ("neighboring", "color", "behavior").
- Validation errors: full sentence, terminal period, no "please".
  Pattern: `"X is required."` / `"X must be unique."` / `"Enter a different name."`
- Destructive modals say **Delete** (never "Remove"); titles carry no question mark.
- Toggle/setting labels are declarative, not questions ("Add start date property",
  not "Add start date property?"). Questions are reserved for confirmation dialogs.
- Pluralize with paraglide `count=1` / `count=*` match blocks — never "note(s)".
- CTA verbs are specific where the action is specific (Connect, Create, Move, Run);
  "Save" only for editing an existing thing.
- No casual register in option labels ("Just move the calendar" → "Move the calendar").

## B. en.json findings

| #   | Finding                                                                                                                                                                                                                                                                                              | Status                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| B1  | Error punctuation/phrasing inconsistent across `*_error` keys; one "Please…"                                                                                                                                                                                                                         | **[normalized]**                                                                                                    |
| B2  | `journal_delete_modal_title` said "Remove {name}" vs "Delete" elsewhere; `?` on view delete title only                                                                                                                                                                                               | **[normalized]**                                                                                                    |
| B3  | No pluralization: "{count} journals" ("1 journals"), "{count} note(s)"                                                                                                                                                                                                                               | **[normalized]**                                                                                                    |
| B4  | en-GB "neighbouring" ×2 in journal-link descriptions                                                                                                                                                                                                                                                 | **[normalized]**                                                                                                    |
| B5  | Title Case in `decoration_corner_placement_label`, `decoration_shape_label`                                                                                                                                                                                                                          | **[normalized]**                                                                                                    |
| B6  | Grammar: `decoration_style_size_hint` run-on ("is same size"); `calendar_picker_first_week_desc` "(1..7)" programmer notation; `journal_edit_date_format_description` dangling "like:"; `view_toolbar_defined_navigation_target` "Walk which notes"; `view_block_summary_hidden_days` "Hides {days}" | **[normalized]**                                                                                                    |
| B7  | Casual "Just move the calendar"                                                                                                                                                                                                                                                                      | **[normalized]**                                                                                                    |
| B8  | `command_type_label`: bare "last" ("Open last daily note") ambiguous vs "last available"                                                                                                                                                                                                             | **[normalized]** ("previous" / "most recent existing")                                                              |
| B9  | Drill-in verb split: "Organize {name}" / "Configure {name}" / "Edit"                                                                                                                                                                                                                                 | **[normalized]** (unified on "Configure")                                                                           |
| B10 | Question-titles on toggles (`calendar_apply_globally_title`, `journal_edit_fm_*_toggle_label`, `journal_edit_confirm_creation_label`, `startup_open_note_desc`)                                                                                                                                      | **[normalized]**                                                                                                    |
| B11 | Split-sentence i18n: decoration modal composes "Decorate elements in calendar when" + mode + "fulfilled" from 3 keys — untranslatable word order                                                                                                                                                     | **[fixed]** (full-sentence options behind a "When to decorate" label)                                               |
| B12 | Jargon leaks: `journal_flow_failure` shows raw `{kind}`; `nav_block_section_use_defaults` interpolates raw enum `{writeType}`; block descriptions use "reference date" / "window"                                                                                                                    | **[fixed]** (`journal_flow_failure` was a dead, never-fired key — removed; use-defaults now matches per write type) |
| B13 | `common_action_submit "Save"` used as CTA for creation modals (Add journal/shelf/view)                                                                                                                                                                                                               | **[fixed]** (creation modals say "Create"; renames keep "Save")                                                     |

## C. Hardcoded user-visible strings (bypass i18n) — all verified, all **[fixed]**

| Location                                                            | Problem                                                                                            | Resolution                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/journals/settings/ui/AddJournalModal.vue`                      | "Every" unit dropdown renders raw literals `day/week/…`                                            | `journal_add_modal_every_unit` match message; `journal_write` custom variant also gained proper unit/plural matches ("every day" / "every 10 days")                                                                                         |
| `src/journals/settings/ui/sections/FrontmatterSection.vue`          | Tooltips built as `` `${label} edit` `` → "Date property name edit" (hardcoded + ungrammatical)    | Reuse the existing `journal_fm_field_modal_title` ("Edit date property name")                                                                                                                                                               |
| `src/journals/settings/ui/sections/SequenceSection.vue`             | Same `` `… edit` `` pattern                                                                        | Reuse `journal_sequence_property_modal_title`                                                                                                                                                                                               |
| `src/main.ts`                                                       | Boot/reload failure notices hardcoded                                                              | i18n'd (`settings_load_failed` / `settings_reload_failed`) — paraglide messages are static imports, safe even when settings fail to load                                                                                                    |
| `src/shelves/ui/JournalList.vue`, `src/commands/ui/CommandList.vue` | Tooltips concatenated `` `${message()} ${name}` `` — fragment keys work only via concatenation     | Parameterized messages (`journal_dashboard_bulk_add({name})`, `command_edit_tooltip`, `common_delete_name`)                                                                                                                                 |
| `src/commands/config.ts:62-76`                                      | Seeded default command names had a grammar split ("Open weekly note" vs "Open next **week** note") | Seeds renamed ("Open next weekly note", "Open previous weekly note", …). Note: migrated v2 vaults keep the old v2 names by design (`legacy/old-shapes.ts` backfills v2 defaults verbatim as user data); only fresh vaults get the new names |

## D. Modal / flow UX

- **D1** **[fixed]** `ConnectNoteModal`: both branches now have a Cancel button, and
  connect/disconnect announce success via Notice (`connect_note_notice_connected` /
  `_disconnected`), wired in `connect-note.flow.ts`.
- **D2** **[fixed]** Delete confirmations explain consequences:
  `DeleteJournalModal` shows a per-mode description (`journal_delete_mode_description`),
  `DeleteViewModal` and `DeleteShelfModal` state that notes are untouched.
- **D3** **[resolved as scoped]** Connect/disconnect got outcome notices (see D1).
  Per user decision: note creation needs no success notice (the note opening is the
  indicator), and bulk-add failures living only in the results log is acceptable.
  A _global_ flow-failure notice remains open: `Flows.invoke` only logs failures.
  Wiring `NoticeService` into `Flows` would ripple through ~36 test containers —
  if wanted later, prefer an optional failure-listener registered by the host module
  over a hard dependency.
- **D4** **[fixed]** Bulk-add "already connected" dropdown shows a per-option
  description; Merge is explained (content appended to the connected note, source
  deleted).
- **D5** **[fixed]** Picker modals' button now reads "Close".
- **D6** **[fixed]** Decoration editor disables Save while conditions or styles are
  empty (the neutral "No … defined yet" rows serve as the hint); submit-only errors
  removed.
- **D7** `DatePickerModal`: no cancel affordance, no title. (Open — minor; Escape and
  click-outside work, and cell-click is the submit.)
- **D8** **[re-assessed: not an issue]** Obsidian's modal shell renders a close "X" on
  every modal; a redundant bottom Close button on reference modals would be noise.

## E. Settings surface UX

- **E1** **[fixed]** Colliding-journals warning now renders a "Configure {name}" link
  per colliding journal, pushing that journal's edit subpage.
- **E2** **[partially fixed]** All four appearance color pickers have descriptions
  (`calendar_appearance_description`). Still open: a live preview cell (the decoration
  editor's preview component could be reused).
- **E3** **[fixed]** Icon / Default shelf / Show in ribbon / Open on startup / "Open in"
  all have descriptions; the view-level "Open on startup" description cross-references
  the startup-note setting.
- **E4** **[fixed]** Shelf section moved to order 65 (after Frontmatter, before
  Commands); Note creation now leads the journal edit page.
- **E5** Name-template row stacks up to 6 description layers (description, variable
  link, preview, collision warning, invertibility warning, move-to-folder
  recommendation) with identical styling — rank visually (warning icon/color,
  callout for recommendations, monospace previews). (Open — design work.)
- **E6** **[fixed]** `WrongWeekWarning.vue` (the actual offender) now uses
  `var(--text-warning)`.

## F. Runtime surfaces UX

- **F1** **[resolved as scoped]** Shelf selector has a "Switch shelf" tooltip. Per user
  decision, period buttons get no tooltips.
- **F2** **[fixed]** Inert period buttons are dimmed (opacity 0.5).
- **F3** **[fixed]** Home code block shows `code_blocks_home_empty` when nothing
  resolves; month/week calendar view blocks show `view_block_calendar_no_journals`
  when the shelf scope has no journals. Still open: the _code-block_ (embedded)
  timeline/calendar variants were not audited for the same states.
- **F4** **[fixed]** Actionable calendar cells are focusable (`role="button"`,
  `tabindex=0`) and open on Enter/Space; `defineOpenMode` accepts keyboard events
  (Ctrl+Enter opens in a new tab). Arrow-key grid navigation remains open.

## G. Cross-cutting (open)

- **Flow-failure convention**: `Flows.invoke` still only logs non-benign failures —
  no user-visible signal. See D3 for the recommended shape.
- **i18n readiness**: the structural blockers found (split sentences, concatenated
  tooltips, "(s)" plurals, raw enum interpolation) are now fixed; remaining known
  gap is seeded command names being en-only data (unavoidable).
- **Copy style rules** (section A) should govern new strings; consider enforcing the
  match-key no-spaces rule too — `"a=b, c=d"` silently declares a `" c"` selector
  (caught by check:types via the generated message signature).

## Remaining open items

1. E5 — visual ranking of the name-template description stack (design work)
2. E2 — appearance preview cell
3. D3/G — global flow-failure notice via optional host-registered listener
4. D7 — DatePickerModal title/cancel affordance
5. F4 — arrow-key navigation across calendar grid cells
6. F3 — audit embedded timeline/home code-block variants' empty states
