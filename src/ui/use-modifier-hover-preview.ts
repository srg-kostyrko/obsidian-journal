import { onUnmounted } from "vue";

interface HoverTarget {
  readonly event: MouseEvent;
  readonly fire: (event: MouseEvent) => void;
}

// v2 behavior: a preview fires when Ctrl/Cmd is already held entering a cell OR pressed
// while hovering it. The window keydown listener exists only between enter and leave, so
// idle components cost nothing. `enter` takes the fire callback so one composable serves
// components hosting many hover targets (e.g. the period badge strip).
export function useModifierHoverPreview(): {
  enter(event: MouseEvent, fire: (event: MouseEvent) => void): void;
  leave(): void;
} {
  let hovered: HoverTarget | null = null;

  const onKeyDown = (key: KeyboardEvent): void => {
    if (key.key !== "Control" && key.key !== "Meta") return;
    hovered?.fire(hovered.event);
  };

  const leave = (): void => {
    hovered = null;
    window.removeEventListener("keydown", onKeyDown);
  };

  const enter = (event: MouseEvent, fire: (event: MouseEvent) => void): void => {
    hovered = { event, fire };
    window.addEventListener("keydown", onKeyDown);
    if (event.ctrlKey || event.metaKey) fire(event);
  };

  onUnmounted(leave);
  return { enter, leave };
}
