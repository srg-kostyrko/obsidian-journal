# Glossary

**Frontmatter**: Metadata at the top of your note, surrounded by `---` lines. The Journal plugin uses frontmatter to store journal name, dates, and other information.

**Decoration**: Visual indicators that mark or highlight specific days in the calendar view based on conditions you set. They can include colors, shapes, icons, or borders. A decoration belongs to one of three scopes: the whole vault, a shelf, or a journal.

**Journal Shelf**: A grouping mechanism to organize multiple journals together (like "Work" or "Personal"). Helps you filter and focus on specific journal contexts.

**View**: A panel you assemble from blocks — calendars, toolbars, dividers, rendered templates — and open in a sidebar or as a tab.

**Navigation Block**: A special code block that generates navigation links between journal entries, customized to each journal type.

**Timeline**: A calendar-like view that displays days of a specific period (week, month, etc.) with links to corresponding journal entries.

**Sequential number**: A number assigned to journal entries (like Sprint 1, Sprint 2). Useful for tracking iterations or repeating periods. It is exposed as a template variable, named `index` by default. A journal can chain several of these **digits** together, most significant first, so the fastest one carries into the next when it resets (like Release4711Sprint1, Release4711Sprint2).

**Notelet**: An extra note a journal keeps for a period, alongside that period's own note — a meeting note on a day, a retro on a sprint. Each belongs to a **notelet type**, which is configured on the journal and decides where its notes go, what they are named, and what they contain. A period can hold any number of notelets.

::: v-pre

**Template Variables**: Special placeholders like `{{date}}` or `{{index}}` that the plugin replaces with actual values when creating notes.

:::
