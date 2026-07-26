import type { AnchorString } from "@/calendar";

export interface PathCollision {
  readonly first: AnchorString;
  readonly second: AnchorString;
  readonly path: string;
}

export function findPathCollision(
  anchors: readonly AnchorString[],
  pathFor: (anchor: AnchorString) => string | undefined,
): PathCollision | null {
  const seen = new Map<string, AnchorString>();
  for (const current of anchors) {
    const path = pathFor(current);
    // An anchor that fails to render tells us nothing about collisions; treating the
    // absent paths as equal would report every such pair as a collision.
    if (path === undefined) continue;
    const first = seen.get(path);
    if (first !== undefined) return { first, second: current, path };
    seen.set(path, current);
  }
  return null;
}
