# Questions

::: v-pre

A journal can ask questions when a note is created, and turn the answers into a property, part of
the note's content, or part of where the note lives. Each question has:

- **Type** — text, number, date, yes/no, or a choice from a fixed list of options. A date
  question has its own format (`YYYY-MM-DD` by default, editable in Moment.js syntax) — it is
  never rendered using the journal's own date format
- **Question**: the prompt text shown in the answer dialog
- **Property**: the frontmatter key the answer is saved under, left blank to not save it at all
- **Required**: refuses to create the note until this one is answered

An answer can reach three places, all through the question's own `{{variable}}`, the same
variable vocabulary a numbering digit uses (see [Supported variables](/reference/variables)):

- The note's **frontmatter**, through its property
- The **note content**, in any template note this journal uses
- The **note name** or **folder**, the same way `{{index}}` does

**An answer used in the note name or folder must be saved to a property.** Recovering that answer
when the plugin later re-reads the note — inverting a rendered file name back into the fields that
produced it — only works from something stored on the note; a question with no property can still
appear in the template content, just not in the name or folder template. A yes/no question can't
go into the name or folder either, whether or not it has a property — there's no natural way to
write "yes" or "no" into a file name that also inverts cleanly, so use a choice question instead.

**`Auto-create today's note` and a question in the note name are mutually exclusive.** Auto-create
runs with nobody at the keyboard to answer anything, so a question whose answer decides the file
name has nobody to ask; turn one off to use the other.

A journal with any questions always opens the answer dialog before writing the note — by clicking
an unresolved link, running a command, or navigating to a date. If that journal also has **Confirm
creating new notes** on, the answer dialog takes over that job too instead of showing a second
dialog after it: even when none of the questions reach the note name, it still shows the note name
it's about to create, just without any typed answer changing what that name will be.

**Recipe: a mood tracker that decorates the calendar.** Add a choice question — "How was today?",
with options like Great, Okay and Rough — and save it to a property, e.g. `mood`. The
[decoration system](/decorations)'s frontmatter property condition already reads any
property a note carries, so a journal decoration matching `mood equals Great` with its own color
paints every day you answered that way, with no other wiring needed.

:::
