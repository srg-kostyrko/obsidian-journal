import { describe, expect, it } from "vitest";

import { createFakeHost } from "./testing";

describe("createFakeHost vault consistency", () => {
  it("exposes a seeded note's frontmatter through the metadata cache", () => {
    const host = createFakeHost();
    const file = host.putFile("daily/2026-05-19.md", "", { journal: "daily" });

    expect(host.app.metadataCache.getFileCache(file)?.frontmatter).toEqual({ journal: "daily" });
  });

  it("reflects a frontmatter write in the metadata cache", async () => {
    const host = createFakeHost();
    const file = host.putFile("daily/2026-05-19.md", "", { journal: "daily" });

    await host.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm["journal-date"] = "2026-05-19";
    });

    expect(host.app.metadataCache.getFileCache(file)?.frontmatter).toEqual({
      journal: "daily",
      "journal-date": "2026-05-19",
    });
  });

  it("reports no frontmatter for a note seeded without any", () => {
    const host = createFakeHost();
    const file = host.putFile("notes/plain.md", "body");

    expect(host.app.metadataCache.getFileCache(file)?.frontmatter).toBeUndefined();
  });

  it("does not emit a vault event when a note is seeded", () => {
    const host = createFakeHost();
    const seen: unknown[] = [];
    host.app.vault.on("create", (f) => seen.push(f));

    host.putFile("daily/2026-05-19.md");

    expect(seen).toEqual([]);
  });
});

describe("createFakeHost metadata staging", () => {
  it("keeps metadata staged through emitMetadata when a frontmatter write lands", async () => {
    const host = createFakeHost();
    const position = { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } };
    const file = host.putFile("daily/2026-05-19.md");
    host.emitMetadata("daily/2026-05-19.md", {
      tags: [{ tag: "#journal", position }],
      frontmatter: { journal: "daily" },
    });

    await host.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm["journal-date"] = "2026-05-19";
    });

    const cached = host.app.metadataCache.getFileCache(file);
    expect(cached?.tags).toEqual([{ tag: "#journal", position }]);
    expect(cached?.frontmatter).toEqual({ journal: "daily", "journal-date": "2026-05-19" });
  });
});
