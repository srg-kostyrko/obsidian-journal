# Journal Configuration

::: v-pre

Each journal can be configured separately with these settings:

- **Note creation**:

  - Note name template: Set the note filename pattern
  - Folder: Where notes will be stored
  - Default date format: How dates appear when a variable doesn't give its own format
  - Confirm creating new notes: Prompt before creating a note you navigate to
  - Auto-create today's note: Create it on plugin load and at every local midnight, on the devices _Automatic note creation_ allows

- **Templates**: Select one or more template notes for new note content

- **Timeline**:

  - Start writing on: When this journal begins
  - End writing: When to stop creating notes (never, after a date, or after N repeats)

- **Sequential numbers**: For numbered entries (like "Sprint 1"), and for chained ones (like "Release4711Sprint1")

  - Enable sequential numbers
  - A journal's numbering is an ordered list of **digits**, slowest first. The last (fastest)
    digit advances once per note; when it wraps around, it carries into the digit above it, the
    way a car odometer's ones wheel turns the tens wheel. Each digit has its own:
    - **Variable name**, used as `{{name}}` in the note name template and folder path
    - **Start number**
    - **Reset rule** — only the first (slowest) digit can be set to _Continuous_ (never resets);
      every digit below it resets after a fixed count, shown as "how many per _\<the digit above
      it\>_"
    - **Frontmatter property** the digit's number is stored in
  - Anchor date: The note on the anchor date gets every digit's start number, and later notes count up from there
  - Digits can only be added at the bottom, as a new fastest digit — there is no way to insert a
    slower one above the current top. To turn a single-counter journal into a chained one (say,
    adding Release above an existing Sprint), rename the existing digit to `release`, give it its
    new start number, and add a finer `sprint` digit beneath it
  - The last remaining digit cannot be deleted; deleting the slowest one promotes the next digit
    to take its place
  - Allow before anchor: Permit numbering earlier notes, which may produce negative numbers. Offered only when the journal has no start date and the slowest digit is Continuous
  - A live **preview** shows the full paths of the next five notes the current configuration
    produces, so a digit used only in the folder template is visible too
  - A note named only by its digits (no date anywhere in the name or folder) can still auto-attach
    to its journal, but only when the slowest digit is Continuous **and** every digit appears in
    the name or folder template. When it can't, the note creation and sequence sections warn with
    the specific reason: which digits the template leaves out, which digit resets and so repeats
    its numbers forever, or which digit below the slowest never resets and so freezes every digit
    above it

  For example, a name template of `Release{{release}}Sprint{{sprint}}` with `release` starting at
  4711 (Continuous) and `sprint` starting at 1 (6 per release) produces `Release4711Sprint1` …
  `Release4711Sprint6`, then `Release4712Sprint1`.

- **Frontmatter**: Customize the properties the plugin writes
  - Date property name
  - Add start date property, with its own property name
  - Add end date property, with its own property name

Every journal row also has a **clone** action. The copy carries the source's whole configuration
under a new name, joins the same shelf, and gets its own copy of the source's commands and, unless
you turn **Copy notelet types** off, of its [notelet types](/notelets). Notes are never copied. The copy starts out with the source's folder and note name template, so the two
resolve to the same note paths until you change one — the colliding journals warning says so until
you do.

:::
