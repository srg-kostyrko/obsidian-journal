import { describe, expect, it } from "vitest";

const exists = (name: string) => name === "work";
const missing = () => false;

import { resolveLeafShelf } from "./leaf-shelf";

describe("resolveLeafShelf", () => {
  it("uses the view's default when the leaf has no override", () => {
    expect(resolveLeafShelf(undefined, "work", exists)).toBe("work");
  });

  it("keeps a leaf scoped to All journals even when the view has a default", () => {
    // Picking "All journals" sets the override to null. Treating that as "no override" made the
    // pick snap straight back to the view's default.
    expect(resolveLeafShelf(null, "work", exists)).toBeNull();
  });

  it("uses the leaf's own shelf over the view's default", () => {
    expect(resolveLeafShelf("work", null, exists)).toBe("work");
  });

  it("falls back to the view's default when the leaf names a shelf that no longer exists", () => {
    // The override is persisted in the workspace layout, so it survives a rename or delete that
    // happened while the leaf was closed. An unresolvable shelf would scope the leaf to nothing.
    expect(resolveLeafShelf("gone", "work", exists)).toBe("work");
  });

  it("falls back to all journals when the leaf's shelf is gone and the view has no default", () => {
    expect(resolveLeafShelf("gone", null, missing)).toBeNull();
  });
});
