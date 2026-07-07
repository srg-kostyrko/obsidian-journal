# Defined-navigation: active-journal target

## Goal

The defined-navigation toolbar item (the ‹/› prev-next buttons that jump to the
nearest note that already exists) walks _all_ journals of a chosen write-type in
the shelf. Add an `active` target so a button can instead walk **only the journal
that owns the currently-open note**.

## Behavior

Add `active` as a new option in the item's "Walk which notes" target dropdown,
alongside Daily / Weekly / Monthly / Quarterly / Yearly / Custom note.

When the target is `active`:

- The candidate journal set is **just the journal owning the currently-open
  note** — regardless of write-type and regardless of shelf membership.
- Prev/next finds the nearest _existing_ note within that one journal, using the
  open note's date as the reference point.
- When no journal note is open, the button is **disabled**.

The other targets are unchanged.

### Deliberate deviation

With "ignore shelf membership," an `active` button can walk a journal that is not
otherwise part of this view's shelf. The item becomes a general "walk the note
I'm in" control rather than a strictly shelf-scoped one. This is intentional.

## Implementation

The item already reads the active entry to compute its reference anchor
(`referenceAnchor()` in `DefinedNavigationItem.vue`). The only real gap is the
candidate set.

1. **`defined-navigation-targets.ts`** — append `"active"` to
   `DEFINED_NAVIGATION_TARGETS`. This flows through the valibot `target` picklist
   and the inferred `DefinedNavigationConfig` type automatically.

2. **`ui/DefinedNavigationItem.vue`** — branch the `candidates` computed:

   ```ts
   const candidates = computed<readonly string[]>(() => {
     const target = props.config.target;
     if (target === "active") {
       const active = activeVM.active.value;
       return active ? [active.journalName] : [];
     }
     return scope[target].value;
   });
   ```

   `referenceAnchor()` needs no change: for `active`, `candidates` is
   `[active.journalName]`, so its existing "active journal is among candidates →
   use its anchor" branch already returns the correct reference. The disabled
   state (`candidates.length === 0`) and the "no earlier/later note" notice also
   work unchanged.

3. **`ui/DefinedNavigationItemConfig.vue`** — the option label branches, because
   `command_write_type_option` has no `active` case:

   ```html
   {{ target === "active" ? m.view_toolbar_defined_navigation_target_active() : m.command_write_type_option({ writeType:
   target }) }}
   ```

4. **i18n** — add `view_toolbar_defined_navigation_target_active`
   (e.g. "Active journal's notes") to `messages/en.json`.

## Testing

- **`DefinedNavigationItem.test.ts`**
  - `active` target navigates to the nearest existing note in the open note's
    journal.
  - `active` target ignores a nearer existing note in a _different_ journal
    (scoping proof).
  - Button is disabled when no journal note is open.
- **`DefinedNavigationItemConfig.test.ts`**
  - Selecting `active` emits `onChange` with `target: "active"`.
- **e2e** — check whether an existing toolbar-navigation wdio spec covers this
  runtime path and should be extended. Do not add a tautological guard spec if
  the component tests already cover the scoping.

## Out of scope

- The `button` toolbar item's navigate mode (a separate item; not touched here).
- Changing how any of the existing write-type targets resolve candidates.
