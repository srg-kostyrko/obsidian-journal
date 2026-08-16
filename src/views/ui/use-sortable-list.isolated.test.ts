import { useSortable } from "@vueuse/integrations/useSortable";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useSortableList, type SortableListOptions } from "./use-sortable-list";

vi.mock("@vueuse/integrations/useSortable", () => ({ useSortable: vi.fn() }));

const useSortableMock = vi.mocked(useSortable);

interface CapturedOptions {
  group?: string;
  draggable?: string;
  onStart: () => void;
  onEnd: (event: { oldIndex?: number; newIndex?: number; from: Element; to: Element }) => void;
  onAdd: (event: { to: HTMLElement; from: HTMLElement; item: HTMLElement; oldIndex?: number }) => void;
}

function capture(
  items: { id: string }[] = [],
  sortableOptions?: SortableListOptions,
): { options: CapturedOptions; onReorder: ReturnType<typeof vi.fn> } {
  useSortableMock.mockClear();
  const onReorder = vi.fn();
  useSortableList(ref(null), ref(items), onReorder, sortableOptions);
  const options = useSortableMock.mock.calls.at(-1)?.[2] as unknown as CapturedOptions;
  return { options, onReorder };
}

describe("useSortableList", () => {
  it("omits group and draggable entirely when not given, rather than passing them as undefined", () => {
    const { options } = capture();
    expect("group" in options).toBe(false);
    expect("draggable" in options).toBe(false);
  });

  it("passes group and draggable through when given", () => {
    const { options } = capture([], { group: "g", draggable: ".nav-row" });
    expect(options.group).toBe("g");
    expect(options.draggable).toBe(".nav-row");
  });

  it("reports the new id order after an item moves to a later index", () => {
    const { options, onReorder } = capture([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const container = document.createElement("div");
    options.onEnd({ oldIndex: 0, newIndex: 2, from: container, to: container });
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("reports the new id order after an item moves to an earlier index", () => {
    const { options, onReorder } = capture([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const container = document.createElement("div");
    options.onEnd({ oldIndex: 2, newIndex: 0, from: container, to: container });
    expect(onReorder).toHaveBeenCalledWith(["c", "a", "b"]);
  });

  it("does not report a reorder when the item is dropped at its original index", () => {
    const { options, onReorder } = capture([{ id: "a" }, { id: "b" }]);
    const container = document.createElement("div");
    options.onEnd({ oldIndex: 1, newIndex: 1, from: container, to: container });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not run onEnd's same-container splice logic for a cross-container move", () => {
    const { options, onReorder } = capture([{ id: "a" }, { id: "b" }]);
    options.onEnd({ oldIndex: 0, newIndex: 1, from: document.createElement("div"), to: document.createElement("div") });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("calls onDragStart/onDragEnd synchronously from onStart/onEnd", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const { options } = capture([], { onDragStart, onDragEnd });
    options.onStart();
    expect(onDragStart).toHaveBeenCalledOnce();
    const container = document.createElement("div");
    options.onEnd({ from: container, to: container });
    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it("reports the target container's DOM order and undoes SortableJS's own move on a cross-container drop", () => {
    const from = document.createElement("div");
    const filler = document.createElement("div");
    from.append(filler);

    const to = document.createElement("div");
    const existing = document.createElement("div");
    existing.dataset.id = "a";
    const item = document.createElement("div");
    item.dataset.id = "b";
    to.append(existing, item);

    const { options, onReorder } = capture([], { group: "g" });
    options.onAdd({ to, from, item, oldIndex: 0 });

    expect(onReorder).toHaveBeenCalledWith(["a", "b"]);
    expect(to.contains(item)).toBe(false);
    expect(from.firstElementChild).toBe(item);
    expect(from.lastElementChild).toBe(filler);
  });

  it("ignores an add event when this list has no group configured", () => {
    const to = document.createElement("div");
    const item = document.createElement("div");
    to.append(item);
    const { options, onReorder } = capture([]);
    options.onAdd({ to, from: document.createElement("div"), item, oldIndex: 0 });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
