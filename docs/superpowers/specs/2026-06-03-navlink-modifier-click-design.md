# Navlink modifier-click navigation (#194)

## Problem

Journal navigation links only respond to a plain left click. Users expect
Obsidian's link behavior: middle-click opens in a new tab, and a modifier
combination opens the entry in a split to the right. Today middle-click does
nothing because the components listen for `click`, which browsers only fire for
the primary (left) button — middle-click fires `auxclick`.

## Behavior

A click on any journal navigation element resolves to one of these open modes,
based on the mouse event:

- Plain left click → open in the current pane.
- Ctrl/Cmd click, or middle-click → open in a new tab.
- Ctrl/Cmd + Alt click, or middle-click + Alt → open in a split to the right.
- Right click → unchanged (context menu).

The same resolution applies everywhere a navigation element opens an entry:
the navigation block links, the previous/next navigation arrows, the home block
links, and the toolbar period/action buttons. Action buttons that only change
the reference date (rather than open an entry) ignore the modifier and behave as
before.

## Scope

The reference-date timeline cell (`notes-calendar`) exposes an open action that
is not wired to any click in the current UI; it is out of scope and unchanged.

## Acceptance scenarios

- Middle-clicking a navigation link opens the entry in a new tab.
- Ctrl/Cmd + Alt clicking a navigation link opens the entry in a split.
- Middle-click + Alt opens the entry in a split.
- Right-clicking a navigation link still shows the context menu and does not
  open the entry.
- A plain left click still opens the entry in the current pane.

## Design notes

Mouse-event → open-mode resolution lives in a single function
(`defineOpenMode`) so the split rule is added once and inherited by every
navigation element. Middle-click is enabled per component by mirroring each
left-click listener with an `auxclick` listener restricted to the middle button,
which also suppresses the default middle-click autoscroll.
