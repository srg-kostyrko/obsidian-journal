// Obsidian renders a task line's checkbox as a plain, enabled `<input type="checkbox">` with no
// handler of its own attached outside a real MarkdownView (measured against real Obsidian). That is
// what licenses catching its click here rather than drawing our own control. Pulled out of the row
// component so the predicate is testable without a real rendered checkbox, which the
// unit-test-tier markdown fake cannot produce.
export function checkboxTarget(event: Event): HTMLInputElement | null {
  const target = event.target;
  return target instanceof HTMLInputElement && target.type === "checkbox" ? target : null;
}
