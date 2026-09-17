# Questions

::: v-pre

A journal can ask questions when it creates a note, and use the answers in the note's properties, its
template content and its name: record a mood, a sprint goal or a due date as a property, write the
answer into the note, or name the note after it.

Questions live in the **Questions** section of a journal's settings page. A [notelet type](/notelets)
has its own questions, separate from its journal's.

## Adding a question

**Add question** opens:

- **Question** — the text the dialog shows.
- **Answer type** — **Text**, **Long text**, **Number**, **Date**, **Yes/No**, **Choice** or **Note
  link**.
- **Date format** — for a date question, the format its answer is written in. `YYYY-MM-DD` by
  default. It is the question's own format, never the journal's.
- **Variable name** — what you type to use the answer: a question named `mood` is `{{mood}}`.
- For a choice question, its choices: each with a **Label**, shown in the dialog, and a **Value**,
  which is what gets saved and written. **Add choice** adds another.
- **Property name** — the property the answer is saved under. Leave it empty to not save the answer:
  it is written into the note once and then gone. A new question fills it in as `journal-` and the
  variable name until you type your own; a long text question starts with it empty.
- **Required** — the note cannot be created without an answer. Not offered for yes/no questions,
  which always have one.

A variable name or property name cannot be one another question or [numbering
digit](/journals#sequential-numbers) of the journal already uses.

## Where an answer goes

| In                        | Write                                              | Gets                                                                                                |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The note's properties     | set **Property name**                              | the answer — a choice's **Value**, a number, a date, `true`/`false`, a note link as a one-item list |
| The note's content        | `{{mood}}` in a [template](/journals#templates)    | the answer as text                                                                                  |
| The note's name or folder | `{{mood}}` in **Note name template** or **Folder** | the answer as text                                                                                  |

How each type reads as text:

- **Choice** — the chosen choice's **Value**, not its label.
- **Yes/No** — "Yes" or "No", in Obsidian's language. The property stores `true` or `false`.
- **Date** — in the question's **Date format**, and it takes every date modification `{{date}}` does:
  `{{due:DD MMM}}`, `{{due+1w}}`. See [Variables](/reference/variables).
- **Number** — as typed, and it takes the offsets and ordinals a numbering digit does:
  `{{pages+1}}`, `{{pages:o}}`.
- **Text** — as typed.
- **Long text** — as typed, over as many lines as the answer has. See [Multi-line answers in
  templates](#multi-line-answers-in-templates).
- **Note link** — the link, brackets included: `[[Roadmap 2027]]`. Write `![[{{project}}]]` to embed
  the note instead — the answer is a link either way.

A question left blank writes nothing into the body.

### Answers in the note name or folder

- **An answer used in the note name or folder must be saved to a property.** The settings page says so
  if you try.
- **A yes/no, long text or note link answer can't be part of a note name or folder.** Use a choice
  question instead of yes/no.
- **Auto-create can't answer.** A journal with **Auto-create today's note** on can't have a question in
  its note name, since nobody is there to answer it. Turn one of them off.
- **Free text in a name stops auto-attach.** A note you make yourself can only be matched back to the
  journal when the name's answers come from a fixed set — a choice, a number or a date. See
  [Auto-attach](/notes#auto-attach).

Example: [Name each day after its mood](#name-each-day-after-its-mood).

### Multi-line answers in templates

A long text answer can span several lines. Written into a template with `{{...}}`, it keeps the
shape of the template line it starts on:

- Inside a quote or callout, every line of the answer stays inside it.
- Under an indented line, every line of the answer keeps that indentation.
- Inside a list item, a line break in the answer continues the item, indented under it; a blank
  line starts the next item instead, with the marker repeated — a numbered list keeps counting,
  and a task item repeats its checkbox.

Blank lines at the start and end of the answer are dropped.

A callout `> {{mood}}`, answered with `a`, `b`, a blank line, then `c`:

```markdown
> {{mood}}
```

```markdown
> a
> b
>
> c
```

A task `- [ ] {{task}}`, answered with `Call Anna`, `about the lease`, a blank line, then `Book
the dentist`:

```markdown
- [ ] {{task}}
```

```markdown
- [ ] Call Anna
      about the lease
- [ ] Book the dentist
```

### Note link answers

A note link answer is saved as a list holding one link, `project: ["[[Roadmap 2027]]"]`, so
Obsidian shows it in backlinks and the graph and updates it when you rename the note.

Answer it by typing: suggestions list every file in your vault, notes first. A name that matches no
file is kept as a link to a note you have not written yet. A name can't contain `#`, `^`, `|`, `[`
or `]`.

The calendar button beside the field links a journal's note instead: choose the period, and the
journal too if your vault has more than one. A note that does not exist yet is linked by its full
path, such as `[[Daily/2026-09-17]]`, so opening the link creates it in the journal's folder. Such
a link is written once and not revisited, so it stops matching if you change the journal's **Note
name template** or **Folder** before the note is created. A journal whose note name uses an answer
can only link notes that already exist.

:::

::: warning Update every device first
Versions before this one discard every question of a journal or notelet type that has a note link
question. Update Journals on each device that syncs this vault before adding one.
:::

::: v-pre

## The answer dialog

Creating a note on a journal with questions opens **New note in** _journal_ before anything is
written. It shows the **Period**, the **Note path** it is about to create — updating as you answer when
the name depends on an answer — and each question.

- **Create** writes the note with your answers. **Cancel** creates nothing.
- A required question can't be left blank, and neither can one whose answer goes into the note name.
- A choice question that is not required offers **(none)**.
- A long text question has a box that spans the dialog. **Enter** starts a new line;
  **Ctrl+Enter** (**Cmd+Enter** on macOS) creates the note.
- A note link question suggests files as you type; the calendar button beside it links a journal's
  note for a period you pick.
- The dialog replaces the confirmation dialog: with **Confirm creating new notes** on, you see this
  dialog and no second one.

Example: [A sprint goal](#a-sprint-goal).

## When questions are asked, and when they are not

Asked:

- when you open a date that has no note — from a calendar, a navigation block, a command or an
  [`obsidian://journals` link](/reference/links);
- when you click a link to a note that does not exist yet, if the plugin wrote that link and the
  journal's name template uses an answer. The dialog asks, then the note is renamed from your answers
  and the link is updated. Cancelling removes the empty note.

Never asked:

- **Opening a note that already exists** — the answers it stored stay as they are.
- **Auto-create.** A journal with a required question, or with a question in its name or folder, is
  skipped.
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
