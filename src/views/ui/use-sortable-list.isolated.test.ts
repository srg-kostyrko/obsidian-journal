import { useSortable } from "@vueuse/integrations/useSortable";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useSortableList } from "./use-sortable-list";

vi.mock("@vueuse/integrations/useSortable", () => ({ useSortable: vi.fn() }));

const useSortableMock = vi.mocked(useSortable);

interface DragEnd {
  oldIndex?: number;
  newIndex?: number;
}

function captureOnEnd(items: { id: string }[]): {
  onEnd: (event: DragEnd) => void;
  onReorder: ReturnType<typeof vi.fn>;
} {
  useSortableMock.mockClear();
  const onReorder = vi.fn();
  useSortableList(ref(null), ref(items), onReorder);
  const options = useSortableMock.mock.calls.at(-1)?.[2] as { onEnd: (event: DragEnd) => void };
  return { onEnd: options.onEnd, onReorder };
}

describe("useSortableList", () => {
  it("reports the new id order after an item moves to a later index", () => {
    const { onEnd, onReorder } = captureOnEnd([{ id: "a" }, { id: "b" }, { id: "c" }]);
    onEnd({ oldIndex: 0, newIndex: 2 });
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });

  it("reports the new id order after an item moves to an earlier index", () => {
    const { onEnd, onReorder } = captureOnEnd([{ id: "a" }, { id: "b" }, { id: "c" }]);
    onEnd({ oldIndex: 2, newIndex: 0 });
    expect(onReorder).toHaveBeenCalledWith(["c", "a", "b"]);
  });

  it("does not report a reorder when the item is dropped at its original index", () => {
    const { onEnd, onReorder } = captureOnEnd([{ id: "a" }, { id: "b" }]);
    onEnd({ oldIndex: 1, newIndex: 1 });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
