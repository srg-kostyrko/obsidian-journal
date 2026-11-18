import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { NoteMetadataService } from "./note-metadata-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";
import type { CachedMetadata } from "obsidian";

function build(): { service: NoteMetadataService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(NoteMetadataService).useClass(NoteMetadataService);
  return { service: c.resolve(NoteMetadataService), host };
}

function anyPos() {
  return { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } };
}

function seed(host: FakeHost, path: VaultPath, cached: CachedMetadata): void {
  host.putFile(path);
  host.emitMetadata(path, cached);
}

describe("NoteMetadataService", () => {
  describe("get", () => {
    it("returns None when the path does not exist", () => {
      const { service } = build();
      expect(service.get("nope.md" as VaultPath).isNone()).toBe(true);
    });

    it("extracts title from file basename", () => {
      const { service, host } = build();
      seed(host, "folder/hello.md" as VaultPath, {});

      const result = service.get("folder/hello.md" as VaultPath);

      expect(result.isSome() && result.value.title).toBe("hello");
    });

    it("returns inline tags with leading hash", () => {
      const { service, host } = build();
      seed(host, "a.md" as VaultPath, { tags: [{ tag: "#daily", position: anyPos() }] });

      const result = service.get("a.md" as VaultPath);
      expect(result.isSome() && result.value.tags).toEqual(["#daily"]);
    });

    it("returns frontmatter tags with a leading hash added", () => {
      const { service, host } = build();
      seed(host, "a.md" as VaultPath, { frontmatter: { tags: ["weekly"] } });

      const result = service.get("a.md" as VaultPath);
      expect(result.isSome() && result.value.tags).toEqual(["#weekly"]);
    });

    it("combines inline and frontmatter tags", () => {
      const { service, host } = build();
      seed(host, "a.md" as VaultPath, {
        tags: [{ tag: "#daily", position: anyPos() }],
        frontmatter: { tags: ["weekly"] },
      });

      const result = service.get("a.md" as VaultPath);
      expect(result.isSome() && result.value.tags).toEqual(["#daily", "#weekly"]);
    });

    it("returns frontmatter as properties", () => {
      const { service, host } = build();
      seed(host, "a.md" as VaultPath, { frontmatter: { mood: 5, label: "ok" } });

      const result = service.get("a.md" as VaultPath);
      expect(result.isSome() && result.value.properties).toEqual({ mood: 5, label: "ok" });
    });
  });

  describe("links", () => {
    it("linksFrom returns resolved and unresolved targets", () => {
      const { service, host } = build();
      host.putFile("a.md");
      host.setLinks("a.md", { resolved: { "Journal/2026-10-05.md": 2 }, unresolved: { "2026-10-06": 1 } });

      expect(service.linksFrom("a.md" as VaultPath)).toEqual({
        resolved: ["Journal/2026-10-05.md"],
        unresolved: ["2026-10-06"],
      });
    });

    it("linksFrom is empty for a note with no links", () => {
      const { service, host } = build();
      host.putFile("a.md");

      expect(service.linksFrom("a.md" as VaultPath)).toEqual({ resolved: [], unresolved: [] });
    });

    it("linkSources lists every source in either map", () => {
      const { service, host } = build();
      host.putFile("a.md");
      host.putFile("b.md");
      host.setLinks("a.md", { resolved: { "x.md": 1 } });
      host.setLinks("b.md", { unresolved: { y: 1 } });

      const sources = service.linkSources();
      expect(sources).toEqual(expect.arrayContaining(["a.md", "b.md"]));
      expect(sources).toHaveLength(2);
    });

    it("onLinksResolved fires with the path and stops after dispose", () => {
      const { service, host } = build();
      host.putFile("a.md");
      const seen: string[] = [];
      const dispose = service.onLinksResolved((path) => seen.push(path));

      host.setLinks("a.md", {});
      dispose();
      host.setLinks("a.md", {});

      expect(seen).toEqual(["a.md"]);
    });
  });
});
