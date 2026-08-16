import type { NavBlockSegment } from "@/journals";

// ids are "<lineIndex>:<segmentIndex>" against the pre-drag lines.
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
