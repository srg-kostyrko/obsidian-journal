import { describe, expect, it } from "vitest";

import { TrackedInstances } from "./tracked-instances";

function fakePlugin() {
  const callbacks: (() => void)[] = [];
  return {
    register: (callback: () => void) => callbacks.push(callback),
    unload: () => {
      for (const callback of callbacks) callback();
    },
  };
}

describe("TrackedInstances", () => {
  it("closes every tracked instance on unload", () => {
    const plugin = fakePlugin();
    const closed: string[] = [];
    const tracked = new TrackedInstances<string>(plugin, (instance) => closed.push(instance));
    tracked.add("a");
    tracked.add("b");
    plugin.unload();
    expect(closed).toEqual(["a", "b"]);
  });

  it("does not close an instance removed before unload", () => {
    const plugin = fakePlugin();
    const closed: string[] = [];
    const tracked = new TrackedInstances<string>(plugin, (instance) => closed.push(instance));
    tracked.add("a");
    tracked.add("b");
    tracked.delete("a");
    plugin.unload();
    expect(closed).toEqual(["b"]);
  });
});
