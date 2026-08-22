import { useResizeObserver } from "@vueuse/core";
import { computed, onMounted, onUpdated, readonly, ref, type Ref } from "vue";

// Set on the row for the duration of a read; the rule that sizes each column to its own content
// lives beside the layout it belongs to, in NavigationCodeBlock.vue.
const MEASURING_CLASS = "nav-view--measuring";

/**
 * Tells a flex row when its columns can no longer share it and it should stack them instead.
 *
 * Flex wrapping is greedy: a row too narrow for three columns drops exactly the one that does not
 * fit, leaving two beside each other and one below (#271). Whether three fit is a property of what
 * they hold rather than of the pane — a day block needs about 355px, a decorated month block about
 * 650px — so no breakpoint stands in for the question and the row has to be measured.
 */
export function useStackWhenTight(row: Ref<HTMLElement | undefined>): Readonly<Ref<boolean>> {
  const stacked = ref(false);

  function neededWidth(el: HTMLElement): number {
    // Plain instanceof, not Obsidian's cross-window-safe .instanceOf(): that method only exists
    // once the real app installs it, so it throws under the test environment's DOM.
    const columns = [...el.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
    // Size every column to its own content for the duration of the read, whatever the row is doing
    // right now, so the answer can never depend on the decision it feeds.
    el.classList.add(MEASURING_CLASS);
    const styles = getComputedStyle(el);
    const gaps = (Number.parseFloat(styles.columnGap) || 0) * Math.max(0, columns.length - 1);
    const padding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
    const content = columns.reduce((total, column) => total + column.getBoundingClientRect().width, 0);
    el.classList.remove(MEASURING_CLASS);
    return content + gaps + padding;
  }

  function measure(): void {
    const el = row.value;
    if (!el) return;
    stacked.value = neededWidth(el) > el.clientWidth;
  }

  // Watch what the row sits in, never the row itself: the row's own size is what this decision
  // changes, so observing it would feed the answer back into the question and leave the two
  // layouts trading places for as long as the block is on screen.
  const host = computed(() => row.value?.parentElement ?? undefined);
  useResizeObserver(host, measure);
  onMounted(measure);
  // A pane that keeps its width can still change what the columns hold — a longer month name, a
  // decoration appearing — which no resize reports.
  onUpdated(measure);

  return readonly(stacked);
}
