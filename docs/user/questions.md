# Questions

::: v-pre

A journal can ask questions when it creates a note: "Questions are asked when a note is created.
Their answers can be used in the note's properties, its template content, and its name." Use them to
record a mood, a sprint goal or a due date as a property, to write the answer into the note, or to
name the note after it.

Questions live in the **Questions** section of a journal's settings page. A [notelet type](/notelets)
has its own questions, separate from its journal's.

## Adding a question

**Add question** opens:

- **Question** — the text the dialog shows.
- **Answer type** — **Text**, **Number**, **Date**, **Yes/No** or **Choice**.
- **Date format** — for a date question, the format its answer is written in. `YYYY-MM-DD` by
  default. It is the question's own format, never the journal's.
- **Variable name** — what you type to use the answer: a question named `mood` is `{{mood}}`.
- For a choice question, its choices: each with a **Label**, shown in the dialog, and a **Value**,
  which is what gets saved and written. **Add choice** adds another.
- **Property name** — the property the answer is saved under. Leave it empty to not save the answer:
  it is written into the note once and then gone.
- **Required** — the note cannot be created without an answer. Not offered for yes/no questions,
  which always have one.

A variable name or property name cannot be one another question or [numbering
digit](/journals#sequential-numbers) of the journal already uses.

## Where an answer goes

| In                        | Write                                              | Gets                                                                |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| The note's properties     | set **Property name**                              | the answer — a choice's **Value**, a number, a date, `true`/`false` |
| The note's content        | `{{mood}}` in a [template](/journals#templates)    | the answer as text                                                  |
| The note's name or folder | `{{mood}}` in **Note name template** or **Folder** | the answer as text                                                  |

How each type reads as text:

- **Choice** — the chosen choice's **Value**, not its label.
- **Yes/No** — "Yes" or "No", in Obsidian's language. The property stores `true` or `false`.
- **Date** — in the question's **Date format**, and it takes every date modification `{{date}}` does:
  `{{due:DD MMM}}`, `{{due+1w}}`. See [Variables](/reference/variables).
- **Number** — as typed, and it takes the offsets and ordinals a numbering digit does:
  `{{pages+1}}`, `{{pages:o}}`.
- **Text** — as typed.

A question left blank writes nothing into the body.

### Answers in the note name or folder

- **An answer used in the note name or folder must be saved to a property.** The settings page says so
  if you try.
- **A yes/no answer can't be part of a note name or folder.** Use a choice question instead.
- **Auto-create can't answer.** A journal with **Auto-create today's note** on can't have a question in
  its note name, since nobody is there to answer it. Turn one of them off.
- **Free text in a name stops auto-attach.** A note you make yourself can only be matched back to the
  journal when the name's answers come from a fixed set — a choice, a number or a date. See
  [Auto-attach](/notes#auto-attach).

## The answer dialog

Creating a note on a journal with questions opens **New note in** _journal_ before anything is
written. It shows the **Period**, the **Note path** it is about to create — updating as you answer when
the name depends on an answer — and each question.

- **Create** writes the note with your answers. **Cancel** creates nothing.
- A required question can't be left blank, and neither can one whose answer goes into the note name.
- A choice question that is not required offers **(none)**.
- The dialog replaces the confirmation dialog: with **Confirm creating new notes** on, you see this
  dialog and no second one.

## When questions are asked, and when they are not

Asked:

- when you open a date that has no note — from a calendar, a navigation block, a command or an
  `obsidian://journals` link;
- when you click a link to a note that does not exist yet, if the plugin wrote that link and the
  journal's name template uses an answer. The dialog asks, then the note is renamed from your answers
  and the link is updated. Cancelling removes the empty note.

Never asked:

- **Opening a note that already exists** — the answers it stored stay as they are.
- **Auto-create.** A journal with a required question, or with a question in its name or folder, is
  skipped. "A required question is never asked when notes are created automatically."
- **Connect note to a journal** and **Bulk add.** The note keeps its own name; see [Notes](/notes).
- **Notes arriving through sync** already carry their answers.

You can change a saved answer later by editing the property. The plugin never removes an answer from
a note when it reopens it.

## Examples

### Name each day after its mood

A daily journal named `prompted` with:

| Setting            | Value                   |
| ------------------ | ----------------------- |
| Note name template | `{{date}} {{mood}}`     |
| Templates          | `Templates/prompted.md` |

and one question:

| Field         | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Question      | How was today?                                                                  |
| Answer type   | Choice — **Label** Great / **Value** `great`, **Label** Okay / **Value** `okay` |
| Variable name | `mood`                                                                          |
| Property name | `mood`                                                                          |
| Required      | on                                                                              |

`Templates/prompted.md`:

```markdown
# {{date}}

Mood: {{mood}}
```

Opening 19 July 2030 shows **New note in** prompted, with **Period** 2030-07-19. Choosing Okay changes
**Note path** to `2030-07-19 okay.md`. **Create** writes that note with `mood: okay` among its
properties and `Mood: okay` in its body.

A link `[[2030-07-20 (unanswered)]]` that the plugin wrote in another note asks the same question when
clicked; answering Okay renames the new note to `2030-07-20 okay.md` and updates the link.

To colour those days on the calendar, add a [decoration](/decorations) with **Check frontmatter
property** `mood` **equals** `okay` — the **Value**, not the label.

### A sprint goal

A custom interval journal named `sprint`: **Every** 2 weeks from 1 July 2030, **Note name template**
`{{journal_name}} {{index}}`, **Confirm creating new notes** on, and one question:

| Field         | Value             |
| ------------- | ----------------- |
| Question      | What is the goal? |
| Answer type   | Text              |
| Variable name | `goal`            |
| Property name | `goal`            |

Opening 1 July 2030 shows **New note in** sprint instead of the confirmation. Answering "Clear the
backlog" creates `sprint 1.md` with `goal: Clear the backlog` and `journal-index: 1` among its
properties.

:::
