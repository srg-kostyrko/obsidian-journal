# Custom Commands

The plugin ships a set of commands for opening the current, next, and previous note of each period type, plus **Zoom out** and **Zoom in**, which step to the journal one period length longer or shorter than the note you have open. Zooming stays on the shelf the open note's journal belongs to, or spans every journal when it is on no shelf; a custom-interval journal takes its place by how long its interval runs, and a granularity no journal in scope writes at is passed over. The note is created if it does not exist yet. You can create more commands of your own:

- **Command types**:

  - Current note for the reference date
  - Next/previous entry in the journal
  - Next/previous _existing_ note (skips gaps to the nearest note that exists)
  - Combined navigation: the same date in the next or previous week, month, or year

- **Targets**: Point a command at one journal, at a whole shelf, or at every journal of a given note type. Journal and shelf commands are prefixed with that name in the command palette.

- **Context** — which note's date the command treats as the current date:

  - Today: Always available, uses today
  - Open note's date, or today: Uses the open journal note's date, falling back to today
  - Open note's date only: Runs only while a journal note is open

- **UI integration**:
  - Add to the ribbon with a custom icon
  - Open note: replacing the active note, in a new tab, next to the active note, or in a popout window
