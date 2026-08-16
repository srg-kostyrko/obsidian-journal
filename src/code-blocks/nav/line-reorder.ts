import type { NavBlockSegment } from "@/journals";

// ids are "<lineIndex>:<segmentIndex>" against the pre-drag lines. A drop always names a
// target line to insert a fresh slot at (splice, not overwrite) — a join reads as an insert
// too because the target's own untouched segments are already part of orderedIds (SortableJS
// hands back the full post-drop DOM order of whatever container received the drop), so the
// freshly inserted slot ends up holding exactly that line's full new content. Lines left empty
// by the move, including one displaced by the insert, are dropped at the end.
export function applySegmentReorder(
  lines: readonly (readonly NavBlockSegment[])[],
  targetLine: number,
  orderedIds: readonly string[],
): NavBlockSegment[][] {
  const moved = new Set(orderedIds);
  const segmentAt = (id: string): NavBlockSegment | undefined => {
    const [line, index] = id.split(":").map(Number);
    return lines[line]?.[index];
  };

  const next: NavBlockSegment[][] = lines.map((line, lineIndex) =>
    line.filter((_, segmentIndex) => !moved.has(`${lineIndex}:${segmentIndex}`)),
  );

  const insertAt = Math.max(0, Math.min(targetLine, next.length));
  next.splice(insertAt, 0, []);
  next[insertAt] = orderedIds.flatMap((id) => {
    const segment = segmentAt(id);
    return segment ? [segment] : [];
  });

  return next.filter((line) => line.length > 0);
}
