# UX & Text Audit — 2026-07-13 (v3-ai)

Deep audit of user-facing text (`messages/en.json`) and UX across settings, modals,
and runtime surfaces. Items marked **[normalized]** were fixed in the en.json
normalization pass done alongside this audit; everything else is future work.

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

| #   | Finding                                                                                                                                                                                                                                                                                              | Status                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| B1  | Error punctuation/phrasing inconsistent across `*_error` keys; one "Please…"                                                                                                                                                                                                                         | **[normalized]**                                                              |
| B2  | `journal_delete_modal_title` said "Remove {name}" vs "Delete" elsewhere; `?` on view delete title only                                                                                                                                                                                               | **[normalized]**                                                              |
| B3  | No pluralization: "{count} journals" ("1 journals"), "{count} note(s)"                                                                                                                                                                                                                               | **[normalized]**                                                              |
| B4  | en-GB "neighbouring" ×2 in journal-link descriptions                                                                                                                                                                                                                                                 | **[normalized]**                                                              |
| B5  | Title Case in `decoration_corner_placement_label`, `decoration_shape_label`                                                                                                                                                                                                                          | **[normalized]**                                                              |
| B6  | Grammar: `decoration_style_size_hint` run-on ("is same size"); `calendar_picker_first_week_desc` "(1..7)" programmer notation; `journal_edit_date_format_description` dangling "like:"; `view_toolbar_defined_navigation_target` "Walk which notes"; `view_block_summary_hidden_days` "Hides {days}" | **[normalized]**                                                              |
| B7  | Casual "Just move the calendar"                                                                                                                                                                                                                                                                      | **[normalized]**                                                              |
| B8  | `command_type_label`: bare "last" ("Open last daily note") ambiguous vs "last available"                                                                                                                                                                                                             | **[normalized]** ("previous" / "most recent existing")                        |
| B9  | Drill-in verb split: "Organize {name}" / "Configure {name}" / "Edit"                                                                                                                                                                                                                                 | **[normalized]** (unified on "Configure")                                     |
| B10 | Question-titles on toggles (`calendar_apply_globally_title`, `journal_edit_fm_*_toggle_label`, `journal_edit_confirm_creation_label`, `startup_open_note_desc`)                                                                                                                                      | **[normalized]**                                                              |
| B11 | Split-sentence i18n: decoration modal composes "Decorate elements in calendar when" + mode + "fulfilled" from 3 keys — untranslatable word order                                                                                                                                                     | open (needs component restructure)                                            |
| B12 | Jargon leaks: `journal_flow_failure` shows raw `{kind}`; `nav_block_section_use_defaults` interpolates raw enum `{writeType}`; block descriptions use "reference date" / "window"                                                                                                                    | partially normalized (descriptions); `{kind}`/`{writeType}` need code changes |
| B13 | `common_action_submit "Save"` used as CTA for creation modals (Add journal/shelf/view)                                                                                                                                                                                                               | open (needs per-modal labels in code)                                         |

## C. Hardcoded user-visible strings (bypass i18n) — all verified

| Location                                                            | Problem                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/journals/settings/ui/AddJournalModal.vue:101-105`              | "Every" unit dropdown renders raw literals `day/week/…`                                                                                                                                                                                                    |
| `src/journals/settings/ui/sections/FrontmatterSection.vue:45,58,70` | Tooltips built as `` `${label} edit` `` → "Date property name edit" (hardcoded + ungrammatical)                                                                                                                                                            |
| `src/journals/settings/ui/sections/SequenceSection.vue:120`         | Same `` `… edit` `` pattern                                                                                                                                                                                                                                |
| `src/main.ts:60,85`                                                 | Boot/reload failure notices hardcoded (may be deliberate: i18n not loaded yet — decide explicitly)                                                                                                                                                         |
| `src/shelves/ui/JournalList.vue`                                    | Tooltips concatenated `` `${m.journal_dashboard_bulk_add()} ${name}` `` — fragment key works only via concatenation                                                                                                                                        |
| `src/commands/config.ts:62-76`                                      | Seeded default command names are English data strings with a grammar split ("Open weekly note" vs "Open next **week** note"). ⚠️ Seeded into user settings — fix before release or accept the fork; commands are name-keyed, so a later migration is risky |

## D. Modal / flow UX

- **D1** `ConnectNoteModal` (src/journals/notes/ui/ConnectNoteModal.vue:124,161): no
  Cancel/secondary button in either branch; Disconnect clears frontmatter with no
  confirmation and silent success.
- **D2** Delete confirmations don't explain consequences. Highest stakes:
  `DeleteJournalModal`'s Keep / Clear journal data / Delete notes dropdown has no
  per-option description ("Delete notes" deletes vault files). `DeleteViewModal`
  only says "cannot be undone"; `DeleteShelfModal` doesn't say notes are untouched.
  The consequence-line pattern already exists in connect-note's toggles — reuse it.
- **D3** Silent outcomes: note creation, connect, disconnect, bulk-add finish with no
  success Notice; bulk-add per-note failures visible only inside the results log.
  Adopt a convention: flows announce outcomes via Notice ("Connected to X",
  "Bulk add finished: 42 added, 2 failed").
- **D4** Bulk-add "Merge" option (when a note is already connected) is unexplained
  anywhere — merge of frontmatter? content?
- **D5** Picker modals (`AddBlockPickerModal`, `AddToolbarItemPickerModal`) auto-submit
  on row click but show a "Cancel" button — should be "Close".
- **D6** Decoration editor validates only on submit ("at least one condition") in an
  800px modal; disable Save with inline hint instead, matching live validation
  elsewhere.
- **D7** `DatePickerModal`: no cancel affordance, no title.
- **D8** Informational reference modals (variable reference, code blocks, Templater,
  date modifications, markdown-template variables) have no close button — Escape only.

## E. Settings surface UX

- **E1** Colliding-journals warning names the journals but offers no link to the fix;
  each name should link to that journal's edit page.
- **E2** Appearance block: 4 color pickers, no descriptions, no preview cell ("active"
  undefined for users). Decoration editor already has a preview-cell component to reuse.
- **E3** View edit page: Icon / Show in ribbon / Open on startup / "Open in" fields
  undescribed. Also two unrelated "open on startup" facilities exist (Startup block:
  note; per-view toggle: view) with no cross-reference.
- **E4** Journal edit section order: Shelf (order 10) renders above Note creation (20);
  essentials should come first.
- **E5** Name-template row stacks up to 6 description layers (description, variable
  link, preview, collision warning, invertibility warning, move-to-folder
  recommendation) with identical styling — rank visually (warning icon/color,
  callout for recommendations, monospace previews).
- **E6** `CalendarWeekBlock` warning uses `rgb(var(--callout-warning))`; every other
  hint uses `var(--text-warning)`.

## F. Runtime surfaces UX

- **F1** No tooltips/aria: `PeriodButtonsItem.vue` badges ("W29", "Q3") and
  `ShelfSelectorItem.vue`. Nav-block chevrons do this right — extend the pattern.
- **F2** Disabled period buttons get `pointer-events: none` but full opacity — look
  broken, not unavailable.
- **F3** Empty/misconfig states render nothing: home code block with no journals is a
  blank div; month/week calendar blocks with no journals in scope render an empty
  grid; a typo'd `shelf:` in a code block gives a blank rectangle. Nav block and
  markdown-template block show the right pattern (explicit message).
- **F4** Calendar grid cells are click/hover only — no focus/keyboard navigation.
  Proportionate first step: `tabindex` + Enter-to-open.

## G. Cross-cutting

- **Feedback asymmetry**: meticulous pre-action warnings (collisions, invertibility,
  out-of-bounds, wrong-week `W`) vs near-silent post-action. One outcome-Notice
  convention closes D1/D3 and future flows.
- **i18n readiness**: paraglide plumbing implies future locales, but split sentences
  (B11), concatenated tooltips (C), and hardcoded seeds (C) mean the first real
  locale forces a rework. Either commit to translatable-by-construction or decide
  en-only explicitly.

## Suggested priority for remaining work

1. D2 — delete-mode consequence descriptions (data-loss adjacent)
2. C seeded command names (release-window constrained)
3. C hardcoded tooltip/option strings (mechanical)
4. D1/D3 — Cancel button + outcome notices
5. F1–F3 — tooltips, disabled styling, empty states
6. Rest opportunistically (B11–B13, D4–D8, E, F4)
